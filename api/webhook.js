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
    
  } catch
