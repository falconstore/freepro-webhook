export default async function handler(req, res) {
  // Só aceita POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('=== WEBHOOK RECEBIDO ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Body:', JSON.stringify(req.body));
    console.log('Headers User-Agent:', req.headers['user-agent']);
    
    // Verificar se tem body
    if (!req.body) {
      console.log('⚠️ Body vazio recebido');
      return res.status(200).json({ 
        received: true, 
        error: 'empty_body',
        timestamp: new Date().toISOString()
      });
    }
    
    const { event, data } = req.body;
    
    // Verificar se tem os campos necessários
    if (!event) {
      console.log('⚠️ Campo "event" não encontrado');
      return res.status(200).json({ 
        received: true, 
        error: 'missing_event',
        timestamp: new Date().toISOString()
      });
    }
    
    // Processar pagamento
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
      
      const {
        customer_email,
        amount,
        status,
        transaction_id
      } = data;
      
      // Determinar plano baseado no valor
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
      }
      
      if (status === 'paid' && customer_email) {
        const password = Math.random().toString(36).slice(-8);
        const expiresAt = calculateExpiration(plan);
        
        console.log('=== PAGAMENTO PROCESSADO ===');
        console.log(`Email: ${customer_email}`);
        console.log(`Valor: R$ ${(amount/100).toFixed(2)}`);
        console.log(`Plano: ${planName}`);
        console.log(`Senha: ${password}`);
        console.log(`Expira: ${expiresAt.toLocaleDateString('pt-BR')}`);
        console.log(`Transaction: ${transaction_id || 'N/A'}`);
        console.log('✅ Processado com sucesso');
        console.log('================================');
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
    console.error('❌ ERRO:', error.message);
    res.status(200).json({ 
      received: true,
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
