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
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL
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
    console.log('=== WEBHOOK RECEBIDO ===');
    console.log('Body:', JSON.stringify(req.body));
    
    const { Event, Data } = req.body;
    
    if (Event === 'Purchase_Order_Confirmed' && Data?.Buyer?.Email) {
      const customer_email = Data.Buyer.Email;
      const amount = Data.Products[0]?.Price || 0;
      const paymentId = Data.Purchase?.PaymentId;
      
      console.log(`Cliente: ${customer_email} | Valor: R$ ${amount}`);
      
      const database = await initFirebase();
      
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
      
      const userRef = database.collection('users').doc(customer_email);
      const existingUser = await userRef.get();
      
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + planMonths);
      
      let password;
      let isNewUser = false;
      
      if (existingUser.exists) {
        console.log('Renovando usuário existente');
        const userData = existingUser.data();
        password = userData.password;
        
        await userRef.update({
          status: 'active',
          plan: plan,
          planName: planName,
          expiresAt: expiresAt.toISOString(),
          lastRenewal: new Date().toISOString(),
          renewalPaymentId: paymentId
        });
      } else {
        console.log('Criando novo usuário');
        isNewUser = true;
        password = generatePassword();
        
        await userRef.set({
          email: customer_email,
          password: password,
          status: 'active',
          plan: plan,
          planName: planName,
          expiresAt: expiresAt.toISOString(),
          createdAt: new Date().toISOString(),
          paymentId: paymentId,
          amount: amount
        });
      }
      
      console.log(`Usuário processado: ${customer_email}`);
      
      const emailSent = await sendEmail(customer_email, password, planName, expiresAt, isNewUser);
      
      console.log(`Email enviado: ${emailSent ? 'Sucesso' : 'Falha'}`);
      
      return res.status(200).json({
        success: true,
        user_created: isNewUser,
        email_sent: emailSent,
        customer: customer_email
      });
    }
    
    return res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('Erro:', error.message);
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

async function sendEmail(email, password, plan, expiresAt, isNewUser) {
  try {
    const subject = isNewUser ? 'FreePro - Conta Ativada!' : 'FreePro - Assinatura Renovada!';
    
    const html = isNewUser ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b82f6, #22c55e); color: white; padding: 30px; text-align: center;">
          <h1 style="margin: 0;">Bem-vindo ao FreePro!</h1>
        </div>
        <div style="background: white; padding: 30px;">
          <h2>Seus dados de acesso:</h2>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Senha:</strong> ${password}</p>
          <p><strong>Plano:</strong> ${plan}</p>
          <p><strong>Válida até:</strong> ${expiresAt.toLocaleDateString('pt-BR')}</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="https://www.freepro.com.br" style="background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px;">Acessar FreePro</a>
          </div>
        </div>
      </div>
    ` : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #22c55e, #3b82f6); color: white; padding: 30px; text-align: center;">
          <h1 style="margin: 0;">Assinatura Renovada!</h1>
        </div>
        <div style="background: white; padding: 30px;">
          <h2>Renovação confirmada:</h2>
          <p><strong>Plano:</strong> ${plan}</p>
          <p><strong>Nova expiração:</strong> ${expiresAt.toLocaleDateString('pt-BR')}</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="https://www.freepro.com.br" style="background: #22c55e; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px;">Acessar FreePro</a>
          </div>
        </div>
      </div>
    `;
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'FreePro <noreply@freepro.com.br>',
        to: email,
        subject: subject,
        html: html
      })
    });
    
    return response.ok;
  } catch (error) {
    console.error('Erro no email:', error);
    return false;
  }
}
