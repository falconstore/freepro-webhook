import admin from 'firebase-admin';

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    })
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('=== WEBHOOK RECEBIDO ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Body:', JSON.stringify(req.body));
    
    if (!req.body) {
      console.log('⚠️ Body vazio recebido');
      return res.status(200).json({ 
        received: true, 
        error: 'empty_body',
        timestamp: new Date().toISOString()
      });
    }
    
    const { event, data } = req.body;
    
    if (!event) {
      console.log('⚠️ Campo "event" não encontrado');
      return res.status(200).json({ 
        received: true, 
        error: 'missing_event',
        timestamp: new Date().toISOString()
      });
    }
    
    if (event === 'payment.approved' || event === 'payment.paid') {
      console.log('💰 Processando pagamento...');
      
      if (!data) {
        console.log('⚠️ Campo "data" não encontrado');
        return res.status(200).json({ 
          received: true, 
          error: 'missing_data',
          timestamp: new Date().toISOString()
        });
      }
      
      const { customer_email, amount, status, transaction_id } = data;
      
      if (!customer_email) {
        console.log('⚠️ Email do cliente não encontrado');
        return res.status(200).json({ 
          received: true, 
          error: 'missing_email',
          timestamp: new Date().toISOString()
        });
      }
      
      // Determinar plano baseado no valor
      let plan = 'monthly';
      let planName = 'Mensal - R$ 9,90';
      let planMonths = 1;
      
      if (amount >= 7990) {
        plan = 'annual';
        planName = 'Anual - R$ 79,90';
        planMonths = 12;
      } else if (amount >= 4790) {
        plan = 'biannual';
        planName = 'Semestral - R$ 47,90';
        planMonths = 6;
      } else if (amount >= 2690) {
        plan = 'quarterly';
        planName = 'Trimestral - R$ 26,90';
        planMonths = 3;
      }
      
      if (status === 'paid' && customer_email) {
        try {
          // Verificar se usuário já existe
          const userRef = db.collection('users').doc(customer_email);
          const existingUser = await userRef.get();
          
          const expiresAt = calculateExpiration(planMonths);
          let password;
          let isNewUser = false;
          
          if (existingUser.exists) {
            // Usuário existente - renovação
            console.log('🔄 Renovando assinatura existente');
            
            const userData = existingUser.data();
            password = userData.password; // Manter senha atual
            
            await userRef.update({
              status: 'active',
              plan: plan,
              planName: planName,
              expiresAt: expiresAt,
              lastRenewal: new Date(),
              renewalTransactionId: transaction_id,
              amount: amount
            });
            
            console.log('✅ Assinatura renovada no Firebase');
            
          } else {
            // Novo usuário
            console.log('👤 Criando novo usuário');
            isNewUser = true;
            
            password = generateSecurePassword();
            
            await userRef.set({
              email: customer_email,
              password: password,
              status: 'active',
              plan: plan,
              planName: planName,
              expiresAt: expiresAt,
              createdAt: new Date(),
              transactionId: transaction_id,
              amount: amount
            });
            
            console.log('✅ Novo usuário criado no Firebase');
          }
          
          console.log('=== DADOS PROCESSADOS ===');
          console.log(`Email: ${customer_email}`);
          console.log(`Valor: R$ ${(amount/100).toFixed(2)}`);
          console.log(`Plano: ${planName}`);
          console.log(`Senha: ${password}`);
          console.log(`Expira: ${expiresAt.toLocaleDateString('pt-BR')}`);
          console.log(`Novo usuário: ${isNewUser ? 'Sim' : 'Não'}`);
          
          // Enviar email apropriado
          const emailSent = isNewUser 
            ? await sendWelcomeEmail(customer_email, password, planName, expiresAt)
            : await sendRenewalEmail(customer_email, planName, expiresAt);
          
          if (emailSent) {
            console.log('✅ Email enviado com sucesso');
          } else {
            console.log('❌ Falha ao enviar email');
          }
          
          console.log('✅ Processamento completo');
          
        } catch (firebaseError) {
          console.error('❌ Erro no Firebase:', firebaseError);
          
          // Mesmo com erro no Firebase, tenta enviar email de notificação
          try {
            await sendErrorNotification(customer_email, firebaseError.message);
          } catch (emailError) {
            console.error('❌ Erro ao enviar email de erro:', emailError);
          }
        }
      }
    } else {
      console.log(`ℹ️ Evento ignorado: ${event}`);
    }
    
    res.status(200).json({ 
      received: true, 
      timestamp: new Date().toISOString(),
      event: event,
      processed: true
    });
    
  } catch (error) {
    console.error('❌ ERRO GERAL:', error.message);
    console.error('Stack:', error.stack);
    
    res.status(200).json({ 
      received: true,
      error: 'processed', 
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Gerar senha segura
function generateSecurePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Email de boas-vindas com SendGrid
async function sendWelcomeEmail(email, password, plan, expiresAt) {
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: email }]
        }],
        from: {
          email: 'noreply@freepro.com.br',
          name: 'FreePro'
        },
        subject: 'FreePro - Conta Ativada com Sucesso!',
        content: [{
          type: 'text/html',
          value: `
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
                  <p style="margin: 0 0 10px; color: #475569;"><strong>Senha:</strong> <code style="background: #e2e8f0; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${password}</code></p>
                  <p style="margin: 0 0 10px; color: #475569;"><strong>Plano:</strong> ${plan}</p>
                  <p style="margin: 0; color: #475569;"><strong>Válida até:</strong> ${expiresAt.toLocaleDateString('pt-BR')}</p>
                </div>
                
                <!-- Botão de Acesso -->
                <div style="text-align: center; margin: 30px 0;">
                  <a href="https://www.freepro.com.br" 
                     style="background: linear-gradient(135deg, #3b82f6, #22c55e); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; text-align: center;">
                    Acessar FreePro Agora
                  </a>
                </div>
                
                <!-- Informações Importantes -->
                <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 20px; margin: 20px 0;">
                  <h3 style="color: #92400e; margin: 0 0 10px; font-size: 16px;">⚠️ Importante:</h3>
                  <ul style="color: #92400e; margin: 0; padding-left: 20px;">
                    <li>Guarde seus dados em local seguro</li>
                    <li>Não compartilhe sua senha com terceiros</li>
                    <li>Acesse sempre através do link oficial</li>
                  </ul>
                </div>
              </div>
              
              <!-- Footer -->
              <div style="background: #1e293b; color: #94a3b8; padding: 20px 30px; text-align: center;">
                <p style="margin: 0; font-size: 14px;">© 2025 FreePro - Calculadoras Profissionais</p>
                <p style="margin: 5px 0 0; font-size: 12px;">Se você não solicitou esta conta, ignore este email.</p>
              </div>
            </div>
          `
        }]
      })
    });
    
    if (response.ok) {
      console.log('📧 Email de boas-vindas enviado via SendGrid para:', email);
      return true;
    } else {
      const error = await response.text();
      console.error('Erro na API SendGrid (welcome):', error);
      return false;
    }
  } catch (error) {
    console.error('Erro ao enviar email de boas-vindas via SendGrid:', error);
    return false;
  }
}

// Email de renovação com SendGrid
async function sendRenewalEmail(email, plan, expiresAt) {
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: email }]
        }],
        from: {
          email: 'noreply@freepro.com.br',
          name: 'FreePro'
        },
        subject: 'FreePro - Assinatura Renovada com Sucesso!',
        content: [{
          type: 'text/html',
          value: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
              <div style="background: linear-gradient(135deg, #22c55e, #3b82f6); color: white; padding: 40px 30px; text-align: center;">
                <h1 style="margin: 0; font-size: 28px; font-weight: 800;">Assinatura Renovada!</h1>
                <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.9;">Continue aproveitando o FreePro</p>
              </div>
              
              <div style="background: white; padding: 40px 30px;">
                <h2 style="color: #1e293b; margin: 0 0 20px; font-size: 20px;">🎉 Renovação confirmada:</h2>
                
                <div style="background: #f0fdf4; padding: 25px; border-left: 4px solid #22c55e; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0 0 10px; color: #166534;"><strong>Plano:</strong> ${plan}</p>
                  <p style="margin: 0; color: #166534;"><strong>Nova data de expiração:</strong> ${expiresAt.toLocaleDateString('pt-BR')}</p>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="https://www.freepro.com.br" 
                     style="background: linear-gradient(135deg, #22c55e, #3b82f6); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                    Continuar Usando FreePro
                  </a>
                </div>
              </div>
              
              <div style="background: #1e293b; color: #94a3b8; padding: 20px 30px; text-align: center;">
                <p style="margin: 0; font-size: 14px;">© 2025 FreePro - Calculadoras Profissionais</p>
              </div>
            </div>
          `
        }]
      })
    });
    
    if (response.ok) {
      console.log('📧 Email de renovação enviado via SendGrid para:', email);
      return true;
    } else {
      const error = await response.text();
      console.error('Erro na API SendGrid (renewal):', error);
      return false;
    }
  } catch (error) {
    console.error('Erro ao enviar email de renovação via SendGrid:', error);
    return false;
  }
}

// Email de notificação de erro
async function sendErrorNotification(email, errorMessage) {
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: 'falconstoregja@gmail.com' }] // Seu email de suporte
        }],
        from: {
          email: 'noreply@freepro.com.br',
          name: 'FreePro System'
        },
        subject: 'FreePro - Erro no Processamento de Pagamento',
        content: [{
          type: 'text/html',
          value: `
            <div style="font-family: Arial, sans-serif;">
              <h2>Erro no Webhook</h2>
              <p><strong>Cliente:</strong> ${email}</p>
              <p><strong>Erro:</strong> ${errorMessage}</p>
              <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
              <p>Verificar e processar manualmente se necessário.</p>
            </div>
          `
        }]
      })
    });
    
    return response.ok;
  } catch (error) {
    console.error('Erro ao enviar notificação de erro:', error);
    return false;
  }
}

// Calcular data de expiração
function calculateExpiration(months) {
  const now = new Date();
  const expiration = new Date(now);
  expiration.setMonth(expiration.getMonth() + months);
  return expiration;
}
