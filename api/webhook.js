export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('=== WEBHOOK RECEBIDO ===');
    console.log('Body completo:', JSON.stringify(req.body, null, 2));
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
    const { event, data } = req.body;
    
    if (event === 'payment.approved' || event === 'payment.paid') {
      const { customer_email, amount, status } = data;
      
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
        
        console.log('=== PAGAMENTO PROCESSADO ===');
        console.log(`Email: ${customer_email}`);
        console.log(`Valor: R$ ${(amount/100).toFixed(2)}`);
        console.log(`Plano: ${planName}`);
        console.log(`Senha gerada: ${password}`);
        console.log(`Status: ${status}`);
        console.log('==============================');
        
        // Aqui futuramente vamos criar no Firebase
        // Por enquanto só registra no log
      }
    }
    
    res.status(200).json({ 
      received: true, 
      timestamp: new Date().toISOString(),
      event: event,
      processed: true
    });
    
  } catch (error) {
    console.error('ERRO no webhook:', error);
    res.status(200).json({ 
      error: 'processed', 
      message: error.message 
    });
  }
}
