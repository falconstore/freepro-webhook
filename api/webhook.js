export default async function handler(req, res) {
  // Só aceita POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Webhook recebido:', JSON.stringify(req.body, null, 2));
    
    const { event, data } = req.body;
    
    // Processar pagamento aprovado
    if (event === 'payment.approved' || event === 'payment.paid') {
      const {
        customer_email,
        amount,
        status
      } = data;
      
      // Determinar plano baseado no valor (em centavos)
      let plan = 'monthly';
      if (amount >= 7990) plan = 'annual';
      else if (amount >= 4790) plan = 'biannual';
      else if (amount >= 2690) plan = 'quarterly';
      
      if (status === 'paid' && customer_email) {
        console.log(`Ativando usuário: ${customer_email}, Plano: ${plan}, Valor: R$ ${amount/100}`);
        
        // Gerar senha aleatória
        const password = Math.random().toString(36).slice(-8);
        
        // Calcular expiração
        const expiresAt = calculateExpiration(plan);
        
        const userData = {
          email: customer_email,
          password: password,
          plan: plan,
          status: 'active',
          expiresAt: expiresAt.toISOString(),
          createdAt: new Date().toISOString(),
          activatedBy: 'webhook',
          amount: amount
        };
        
        // Aqui você integraria com Firebase
        await activateUserInFirebase(userData);
        
        console.log(`✅ Usuário ${customer_email} ativado com sucesso`);
      }
    }
    
    // SEMPRE responder 200 OK para LastLink
    res.status(200).json({ 
      received: true, 
      timestamp: new Date().toISOString(),
      event: event 
    });
    
  } catch (error) {
    console.error('Erro no webhook:', error);
    // Mesmo com erro, responder 200 OK
    res.status(200).json({ 
      error: 'processed', 
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
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

async function activateUserInFirebase(userData) {
  // Por enquanto só log - depois integra com Firebase
  console.log('Dados para Firebase:', userData);
  
  // Aqui você faria:
  // const admin = require('firebase-admin');
  // await admin.firestore().collection('users').doc(userData.email).set(userData);
  
  return true;
}
