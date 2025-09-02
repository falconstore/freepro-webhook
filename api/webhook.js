export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('=== WEBHOOK LASTLINK ===');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const { Event, Data, IsTest } = req.body;
    
    const activationEvents = [
      'Purchase_Order_Confirmed',
      'Recurrent_Payment',
      'Purchase_Approved'
    ];
    
    if (activationEvents.includes(Event) && Data && !IsTest) {
      const email = Data.Buyer?.Email;
      const value = Data.Purchase?.Price?.Value;
      
      if (email && value) {
        // Determinar plano
        let plan = 'monthly';
        if (value >= 79.90) plan = 'annual';
        else if (value >= 47.90) plan = 'biannual';
        else if (value >= 26.90) plan = 'quarterly';
        
        const password = Math.random().toString(36).slice(-8);
        const expiresAt = calculateExpiration(plan);
        
        const userData = {
          email: email,
          password: password,
          plan: plan,
          status: 'active',
          expiresAt: expiresAt.toISOString(),
          createdAt: new Date().toISOString(),
          activatedBy: 'webhook',
          paymentAmount: value
        };
        
        // Criar no Firebase
        await createUserInFirebase(userData);
        
        console.log('✅ Usuário criado no Firebase:', email);
      }
    }
    
    res.status(200).json({ received: true, event: Event });
    
  } catch (error) {
    console.error('❌ ERRO:', error.message);
    res.status(200).json({ received: true, error: 'processed' });
  }
}

async function createUserInFirebase(userData) {
  const admin = await import('firebase-admin');
  
  if (!admin.default.apps.length) {
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };
    
    admin.default.initializeApp({
      credential: admin.default.credential.cert(serviceAccount)
    });
  }
  
  await admin.default.firestore()
    .collection('users')
    .doc(userData.email)
    .set(userData);
}

function calculateExpiration(plan) {
  const now = new Date();
  switch(plan) {
    case 'monthly': return new Date(now.setMonth(now.getMonth() + 1));
    case 'quarterly': return new Date(now.setMonth(now.getMonth() + 3));
    case 'biannual': return new Date(now.setMonth(now.getMonth() + 6));
    case 'annual': return new Date(now.setFullYear(now.getFullYear() + 1));
    default: return new Date(now.setMonth(now.getMonth() + 1));
  }
}
