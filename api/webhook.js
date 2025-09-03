let admin;
let db;

async function initFirebase() {
  if (!admin) {
    const { default: firebaseAdmin } = await import('firebase-admin');
    admin = firebaseAdmin;
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      })
    });
  }

  if (!db) {
    db = admin.firestore();
  }
  
  return db;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('=== WEBHOOK LASTLINK RECEBIDO ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Body:', JSON.stringify(req.body));
    
    const { Event, Data } = req.body;
    
    if (Event === 'Purchase_Order_Confirmed' && Data?.Buyer?.Email) {
      const customer_email = Data.Buyer.Email;
      const amount = Data.Products[0]?.Price || 0;
      const paymentId = Data.Purchase?.PaymentId;
      const paymentDate = Data.Purchase?.PaymentDate;
      
      console.log(`Cliente: ${customer_email} | Valor: R$ ${amount} | ID: ${paymentId}`);
      
      try {
        // Conectar ao Firebase
        const database = await initFirebase();
        
        // Determinar plano baseado no valor
        let plan = 'monthly';
        let planName = 'Mensal - R$ 9,90';
        let planMonths = 1;
        
        if (amount >= 79.90) {
          plan = 'annual';
          planName = 'Anual - R$ 79,90';
          planMonths = 12;
        } else if (amount >= 47.90) {
          plan = 'biannual';
          planName = 'Semestral - R$ 47,90';
          planMonths = 6;
        } else if (amount >= 26.90) {
          plan = 'quarterly';
          planName = 'Trimestral - R$ 26,90';
          planMonths = 3;
        }
        
        // Verificar se usuário já existe
        const userRef = database.collection('users').doc(customer_email);
        const existingUser = await userRef.get();
        
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + planMonths);
        
        let password;
        let isNewUser = false;
        
        if (existingUser.exists) {
          // Usuário existente - renovação
          console.log('Renovando assinatura existente');
          
          const userData = existingUser.data();
          password = userData.password; // Manter senha atual
          
          await userRef.update({
            status: 'active',
            plan: plan,
            planName: planName,
            expiresAt: expiresAt.toISOString(), // Formato ISO
            lastRenewal: new Date().toISOString(), // Formato ISO
            renewalPaymentId: paymentId,
            renewalAmount: amount
          });
          
          console.log('Assinatura renovada no Firebase');
          
        } else {
          // Novo usuário
          console.log('Criando nova conta');
          isNewUser = true;
          
          password = generateSecurePassword();
          
          await userRef.set({
            email: customer_email,
            password: password,
            status: 'active',
            plan: plan,
            planName: planName,
            expiresAt: expiresAt.toISOString(), // Formato ISO
            createdAt: new Date().toISOString(), // Formato ISO
            paymentId: paymentId,
            paymentDate: paymentDate,
            amount: amount
          });
          
          console.log('Nova conta criada no Firebase');
        }
        
        console.log(`Usuario processado: ${customer_email} | Plano: ${planName} | Expira: ${expiresAt.toLocaleDateString('pt-BR')}`);
        
        // Enviar email apropriado via Resend
        const emailSent = isNewUser 
          ? await sendWelcomeEmailResend(customer_email, password, planName, expiresAt)
          : await sendRenewalEmailResend(customer_email, planName, expiresAt);
        
        if (emailSent) {
          console.log('Email enviado com sucesso via Resend');
        } else {
          console.log('Falha no envio do email');
          // Tentar enviar notificação de erro para suporte
          await sendErrorNotificationResend(customer_email, 'Falha no envio de email');
        }
        
        console.log('Processamento completo com sucesso');
        
        return res.status(200).json({
          success: true,
          processed: true,
          user_created: isNewUser,
          user_renewed: !isNewUser,
          email_sent: emailSent,
          customer: customer_email,
          plan: planName,
          expires_at: expiresAt.toISOString(),
          timestamp: new Date().toISOString()
        });
        
      } catch (firebaseError) {
        console.error('Erro no Firebase:', firebaseError.message);
        console.error('Stack:', firebaseError.stack);
        
        // Notificar erro para suporte
        await sendErrorNotificationResend(customer_email, `Erro Firebase: ${firebaseError.message}`);
        
        return res.status(200).json({
          received: true,
          error: 'firebase_error',
          message: firebaseError.message,
          customer: customer_email,
          timestamp: new Date().toISOString()
        });
      }
    } else {
      console.log(`Evento ignorado: ${Event}`);
      return res.status(200).json({ 
        received: true, 
        event: Event, 
        ignored: true,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('Erro geral no webhook:', error.message);
    console.error('Stack completo:', error.stack);
    
    return res.status(200).json({ 
      received: true,
      error: 'general_error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Gerar senha segura de 8 caracteres
function generateSecurePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Email de boas-vindas para novos usuários via Resend
async function sendWelcomeEmailResend(email, password, plan, expiresAt) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'FreePro <onboarding@resend.dev>', // Temporário até DNS aprovar
        to: email,
        subject: 'FreePro - Conta Ativada com Sucesso!',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #3b82f6, #22c55e); color: white; padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 800;">Bem-vindo ao FreePro!</h1>
              <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.9;">Sua conta foi ativada com sucesso</p>
            </div>
            
            <!-- Dados de Acesso -->
            <div style="background: white; padding: 40px 30px;">
              <h2 style="color: #1e293b; margin: 0 0 20px; font-size: 20px;">🔑 Seus dados de acesso:</h2>
              
              <div style="background: #f1f5f9; padding: 25px; border-left: 4px solid #3b82f6; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0 0 10px; color: #475569;"><strong>Email:</strong> ${email}</p>
                <p style="margin: 0 0 10px; color: #475569;"><strong>Senha:</strong> <code style="background: #e2e8f0; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-weight: bold;">${password}</code></p>
                <p style="margin: 0 0 10px; color: #475569;"><strong>Plano:</strong> ${plan}</p>
                <p style="margin: 0; color: #475569;"><strong>Válida até:</strong> ${expiresAt.toLocaleDateString('pt-BR')}</p>
              </div>
              
              <!-- Botão de Acesso -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://www.freepro.com.br" 
                   style="background: linear-gradient(135deg, #3b82f6, #22c55e); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                  Acessar FreePro Agora
                </a>
              </div>
              
              <!-- Informações do Sistema -->
              <div style="background: #f0f9ff; border: 1px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #1e40af; margin: 0 0 10px; font-size: 16px;">📊 O que você pode fazer:</h3>
                <ul style="color: #1e40af; margin: 0; padding-left: 20px;">
                  <li>Calculadora ArbiPro - Arbitragem esportiva</li>
                  <li>Calculadora FreePro - Estratégias com freebets</li>
                  <li>Otimização automática de stakes</li>
                  <li>Cálculos profissionais em tempo real</li>
                </ul>
              </div>
              
              <!-- Informações Importantes -->
              <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #92400e; margin: 0 0 10px; font-size: 16px;">⚠️ Importante:</h3>
                <ul style="color: #92400e; margin: 0; padding-left: 20px;">
                  <li>Guarde seus dados em local seguro</li>
                  <li>Não compartilhe sua senha com terceiros</li>
                  <li>Acesse sempre através do link oficial</li>
                  <li>Em caso de problemas, entre em contato conosco</li>
                </ul>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background: #1e293b; color: #94a3b8; padding: 20px 30px; text-align: center;">
              <p style="margin: 0; font-size: 14px;">© 2025 FreePro - Calculadoras Profissionais para Apostas Esportivas</p>
              <p style="margin: 5px 0 0; font-size: 12px;">Se você não solicitou esta conta, ignore este email.</p>
            </div>
          </div>
        `
      })
    });
    
    if (response.ok) {
      console.log('Email de boas-vindas enviado via Resend para:', email);
      return true;
    } else {
      const error = await response.text();
      console.error('Erro na API Resend (welcome):', error);
      return false;
    }
  } catch (error) {
    console.error('Erro ao enviar email de boas-vindas via Resend:', error);
    return false;
  }
}

// Email de renovação para usuários existentes via Resend
async function sendRenewalEmailResend(email, plan, expiresAt) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'FreePro <onboarding@resend.dev>', // Temporário até DNS aprovar
        to: email,
        subject: 'FreePro - Assinatura Renovada com Sucesso!',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #22c55e, #3b82f6); color: white; padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 800;">Assinatura Renovada!</h1>
              <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.9;">Continue aproveitando o FreePro</p>
            </div>
            
            <!-- Confirmação da Renovação -->
            <div style="background: white; padding: 40px 30px;">
              <h2 style="color: #1e293b; margin: 0 0 20px; font-size: 20px;">🎉 Renovação confirmada:</h2>
              
              <div style="background: #f0fdf4; padding: 25px; border-left: 4px solid #22c55e; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0 0 10px; color: #166534;"><strong>Plano:</strong> ${plan}</p>
                <p style="margin: 0; color: #166534;"><strong>Nova data de expiração:</strong> ${expiresAt.toLocaleDateString('pt-BR')}</p>
              </div>
              
              <!-- Botão de Acesso -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://www.freepro.com.br" 
                   style="background: linear-gradient(135deg, #22c55e, #3b82f6); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                  Continuar Usando FreePro
                </a>
              </div>
              
              <!-- Lembrete -->
              <div style="background: #f0f9ff; border: 1px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="color: #1e40af; margin: 0; text-align: center;">
                  <strong>Suas credenciais de acesso continuam as mesmas.</strong><br>
                  Entre no sistema com o mesmo email e senha de sempre.
                </p>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background: #1e293b; color: #94a3b8; padding: 20px 30px; text-align: center;">
              <p style="margin: 0; font-size: 14px;">© 2025 FreePro - Calculadoras Profissionais</p>
              <p style="margin: 5px 0 0; font-size: 12px;">Obrigado por continuar conosco!</p>
            </div>
          </div>
        `
      })
    });
    
    if (response.ok) {
      console.log('Email de renovação enviado via Resend para:', email);
      return true;
    } else {
      const error = await response.text();
      console.error('Erro na API Resend (renewal):', error);
      return false;
    }
  } catch (error) {
    console.error('Erro ao enviar email de renovação via Resend:', error);
    return false;
  }
}

// Email de notificação de erro para suporte via Resend
async function sendErrorNotificationResend(customerEmail, errorMessage) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'FreePro System <onboarding@resend.dev>',
        to: 'falconstoregja@gmail.com', // Seu email de suporte
        subject: 'FreePro - Erro no Processamento de Pagamento',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
              <h2 style="margin: 0;">Erro no Webhook FreePro</h2>
            </div>
            <div style="padding: 20px; background: white;">
              <p><strong>Cliente:</strong> ${customerEmail}</p>
              <p><strong>Erro:</strong> ${errorMessage}</p>
              <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
              <p><strong>Ação necessária:</strong> Verificar e processar manualmente se necessário.</p>
            </div>
          </div>
        `
      })
    });
    
    return response.ok;
  } catch (error) {
    console.error('Erro ao enviar notificação de erro via Resend:', error);
    return false;
  }
}
