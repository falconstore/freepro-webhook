export default async function handler(req, res) {
  // Só aceita POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('=== WEBHOOK RECEBIDO ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Body completo:', JSON.stringify(req.body, null, 2));
    console.log('User-Agent:', req.headers['user-agent']);
    
    const { event, data } = req.body;
    
    // Processar pagamento aprovado/pago
    if (event === 'payment.approved' || event === 'payment.paid') {
      const {
        customer_email,
        amount,
        status,
        transaction_id,
        metadata
      } = data;
      
      // Determinar plano baseado no valor (em centavos)
      let plan = 'monthly';
      let planName = 'Mensal - R$ 9,90';
      
      if (amount >= 7990) {
        plan = 'annual';
        planName = 'Anual - R$ 79,90';
      } else if (amount >= 4790) {
        plan = 'biannual';
        planName = 'Semestral - R$ 47,90';
      } else if (amount >= 2690) {
        plan = 'quarterly';
        planName = 'Trimestral - R$ 26,90';
      } else if (amount >= 990) {
        plan = 'monthly';
        planName = 'Mensal - R$ 9,90';
      }
      
      if (status === 'paid' && customer_email) {
        // Gerar senha aleatória (8 caracteres)
        const password = Math.random().toString(36).slice(-8);
        
        // Calcular data de expiração
        const expiresAt = calculateExpiration(plan);
        
        // Dados do usuário
        const userData = {
          email: customer_email,
          password: password,
          plan: plan,
          planName: planName,
          status: 'active',
          expiresAt: expiresAt.toISOString(),
          createdAt: new Date().toISOString(),
          activatedBy: 'webhook',
          paymentAmount: amount,
          transactionId: transaction_id || 'N/A'
        };
        
        console.log('=== PAGAMENTO PROCESSADO ===');
        console.log(`Email: ${customer_email}`);
        console.log(`Valor pago: R$ ${(amount/100).toFixed(2)}`);
        console.log(`Plano identificado: ${planName}`);
        console.log(`Senha gerada: ${password}`);
        console.log(`Expira em: ${expiresAt.toLocaleDateString('pt-BR')}`);
        console.log(`Transaction ID: ${transaction_id || 'N/A'}`);
        console.log('Dados do usuário:', JSON.stringify(userData, null, 2));
        
        // AQUI: Futuramente integrar com Firebase
        // await createUserInFirebase(userData);
        
        console.log('✅ Usuário processado com sucesso');
        console.log('================================');
      } else {
        console.log('⚠️ Pagamento não processado:');
        console.log(`Status: ${status}`);
        console.log(`Email: ${customer_email || 'Não informado'}`);
      }
    } else {
      console.log(`ℹ️ Evento ignorado: ${event}`);
    }
    
    // SEMPRE responder 200 OK para LastLink
    res.status(200).json({ 
      received: true, 
      timestamp: new Date().toISOString(),
      event: event || 'unknown',
      processed: true,
      webhook_version: '1.0'
    });
    
  } catch (error) {
    console.error('❌ ERRO no webhook:', error.message);
    console.error('Stack:', error.stack);
    
    // Mesmo com erro, responder 200 OK
    res.status(200).json({ 
      received: true,
      error: 'processed', 
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Função para calcular data de expiração
function calculateExpiration(plan) {
  const now = new Date();
  
  switch(plan) {
    case 'monthly':
      return new Date(now.setMonth(now.getMonth() + 1));
    case 'quarterly':
      return new Date(now.setMonth(now.getMonth() + 3));
    case 'biannual':
      return new Date(now.setMonth(now.getMonth() + 6));
    case 'annual':
      return new Date(now.setFullYear(now.getFullYear() + 1));
    default:
      return new Date(now.setMonth(now.getMonth() + 1));
  }
}

// Função para criar usuário no Firebase (implementar depois)
async function createUserInFirebase(userData) {
  // TODO: Implementar integração com Firebase
  console.log('Firebase: Usuário seria criado aqui');
  return true;
}
