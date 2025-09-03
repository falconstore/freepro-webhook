let admin;
let db;

async function initFirebase() {
  if (!admin) {
    console.log('Importando Firebase Admin...');
    const { default: firebaseAdmin } = await import('firebase-admin');
    admin = firebaseAdmin;
  }

  if (!admin.apps.length) {
    console.log('Inicializando Firebase...');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      })
    });
    console.log('Firebase inicializado com sucesso');
  }

  if (!db) {
    db = admin.firestore();
    console.log('Firestore conectado');
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
    console.log('Event recebido:', Event);
    
    if (Event === 'Purchase_Order_Confirmed' && Data?.Buyer?.Email) {
      const customer_email = Data.Buyer.Email;
      const amount = Data.Products[0]?.Price || 0;
      const paymentId = Data.Purchase?.PaymentId;
      
      console.log(`✅ Dados extraídos - Cliente: ${customer_email}, Valor: R$ ${amount}`);
      
      try {
        console.log('🔥 Iniciando conexão Firebase...');
        const database = await initFirebase();
        console.log('🔥 Firebase conectado com sucesso');
        
        // Teste de conectividade
        console.log('🧪 Testando acesso ao Firestore...');
        const testRef = database.collection('users').doc('test');
        console.log('🧪 Referência criada, tentando ler...');
        
        const password = 'teste123';
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);
        
        console.log('💾 Tentando salvar usuário no Firebase...');
        await database.collection('users').doc(customer_email).set({
          email: customer_email,
          password: password,
          status: 'active',
          plan: 'monthly',
          planName: 'Mensal - R$ 9,90',
          expiresAt: expiresAt,
          createdAt: new Date(),
          paymentId: paymentId,
          amount: amount,
          debug: true
        });
        
        console.log('✅ USUÁRIO SALVO COM SUCESSO NO FIREBASE!');
        console.log(`📧 Dados salvos: ${customer_email} - ${password}`);
        
        return res.status(200).json({
          success: true,
          message: 'Usuário criado com sucesso',
          customer: customer_email,
          password: password,
          firebase_saved: true
        });
        
      } catch (firebaseError) {
        console.error('❌ ERRO DO FIREBASE:', firebaseError.message);
        console.error('❌ Stack completo:', firebaseError.stack);
        
        return res.status(200).json({
          received: true,
          firebase_error: firebaseError.message,
          customer: customer_email
        });
      }
    }
    
    console.log('ℹ️ Evento ignorado:', Event);
    return res.status(200).json({ received: true, event: Event });
    
  } catch (error) {
    console.error('❌ ERRO GERAL:', error.message);
    console.error('❌ Stack:', error.stack);
    return res.status(200).json({ 
      received: true, 
      error: error.message 
    });
  }
}
