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
    console.log('=== WEBHOOK RECEBIDO ===');
    console.log('Body:', JSON.stringify(req.body));
    
    const { event, data } = req.body;
    
    if (event === 'payment.approved' || event === 'payment.paid') {
      const { customer_email, amount, status, transaction_id } = data;
      
      if (status === 'paid' && customer_email) {
        // Inicializar Firebase
        const database = await initFirebase();
        
        // Determinar plano
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
        
        const password = generatePassword();
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + planMonths);
        
        // Salvar no Firebase
        await database.collection('users').doc(customer_email).set({
          email: customer_email,
          password: password,
          status: 'active',
          plan: plan,
          planName: planName,
          expiresAt: expiresAt,
          createdAt: new Date(),
          transactionId: transaction_id
        });
        
        console.log('Usuario salvo:', customer_email);
        
        // Enviar email
        const emailSent = await sendEmail(customer_email, password, planName, expiresAt);
        
        return res.status(200).json({
          success: true,
          user_created: true,
          email_sent: emailSent,
          customer: customer_email
        });
      }
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

async function sendEmail(email, password, plan, expiresAt) {
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
        subject: 'FreePro - Conta Ativada!',
        content: [{
          type: 'text/html',
          value: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1>Bem-vindo ao FreePro!</h1>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Senha:</strong> ${password}</p>
              <p><strong>Plano:</strong> ${plan}</p>
              <p><strong>Válida até:</strong> ${expiresAt.toLocaleDateString('pt-BR')}</p>
              <a href="https://www.freepro.com.br">Acessar FreePro</a>
            </div>
          `
        }]
      })
    });
    
    return response.ok;
  } catch (error) {
    console.error('Erro email:', error);
    return false;
  }
}
