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
    console.log('Body:', JSON.stringify(req.body));
    
    const { Event, Data } = req.body;
    
    if (Event === 'Purchase_Order_Confirmed' && Data?.Buyer?.Email) {
      const customer_email = Data.Buyer.Email;
      const amount = Data.Products[0]?.Price || 0;
      const paymentId = Data.Purchase?.PaymentId;
      
      console.log(`Cliente: ${customer_email}, Valor: R$ ${amount}`);
      
      // Inicializar Firebase
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
        // Renovação
        console.log('Renovando usuário existente');
        const userData = existingUser.data();
        password = userData.password;
        
        await userRef.update({
          status: 'active',
          plan: plan,
          planName: planName,
          expiresAt: expiresAt,
          lastRenewal: new Date(),
          renewalPaymentId: paymentId
        });
      } else {
        // Novo usuário
        console.log('Criando novo usuário');
        isNewUser = true;
        password = generatePassword();
        
        await userRef.set({
          email: customer_email,
          password: password,
          status: 'active',
          plan: plan,
          planName: planName,
          expiresAt: expiresAt,
          createdAt: new Date(),
          paymentId: paymentId,
          amount: amount
        });
      }
      
      console.log(`Usuário processado: ${customer_email}, Senha: ${password}`);
      
      // Enviar email
      const emailSent = isNewUser 
        ? await sendWelcomeEmail(customer_email, password, planName, expiresAt)
        : await sendRenewalEmail(customer_email, planName, expiresAt);
      
      console.log(`Email enviado: ${emailSent ? 'Sucesso' : 'Falha'}`);
      
      return res.status(200).json({
        success: true,
        user_created: isNewUser,
        user_renewed: !isNewUser,
        email_sent: emailSent,
        customer: customer_email,
        plan: planName
      });
    }
    
    console.log('Evento ignorado:', Event);
    return res.status(200).json({ received: true, event: Event });
    
  } catch (error) {
    console.error('Erro:', error.message);
    console.error('Stack:', error.stack);
    return res.status(200).json({ 
      received: true, 
      error: error.message 
    });
  }
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function sendWelcomeEmail(email, password, plan, expiresAt) {
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: 'noreply@freepro.com.br', name: 'FreePro' },
        subject: 'FreePro - Conta Ativada com Sucesso!',
        content: [{
          type: 'text/html',
          value: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc;">
              <div style="background: linear-gradient(135deg, #3b82f6, #22c55e); color: white; padding: 40px 30px; text-align: center;">
                <h1 style="margin: 0; font-size: 28px;">Bem-vindo ao FreePro!</h1>
                <p style="margin: 10px 0 0;">Sua conta foi ativada com sucesso</p>
              </div>
              <div style="background: white; padding: 40px 30px;">
                <h2 style="color: #1e293b; margin: 0 0 20px;">Seus dados de acesso:</h2>
                <div style="background: #f1f5f9; padding: 25px; border-left: 4px solid #3b82f6; border-radius: 8px;">
                  <p style="margin: 0 0 10px;"><strong>Email:</strong> ${email}</p>
                  <p style="margin: 0 0 10px;"><strong>Senha:</strong> <code>${password}</code></p>
                  <p style="margin: 0 0 10px;"><strong>Plano:</strong> ${plan}</p>
                  <p style="margin: 0;"><strong>Válida até:</strong> ${expiresAt.toLocaleDateString('pt-BR')}</p>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="https://www.freepro.com.br" style="background: linear-gradient(135deg, #3b82f6, #22c55e); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px;">Acessar FreePro Agora</a>
                </div>
              </div>
            </div>
          `
        }]
      })
    });
    
    return response.ok;
  } catch (error) {
    console.error('Erro SendGrid:', error);
    return false;
  }
}

async function sendRenewalEmail(email, plan, expiresAt) {
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: 'noreply@freepro.com.br', name: 'FreePro' },
        subject: 'FreePro - Assinatura Renovada!',
        content: [{
          type: 'text/html',
          value: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1>Assinatura Renovada!</h1>
              <p><strong>Plano:</strong> ${plan}</p>
              <p><strong>Nova data de expiração:</strong> ${expiresAt.toLocaleDateString('pt-BR')}</p>
              <a href="https://www.freepro.com.br">Continuar Usando FreePro</a>
            </div>
          `
        }]
      })
    });
    
    return response.ok;
  } catch (error) {
    console.error('Erro SendGrid:', error);
    return false;
  }
}
