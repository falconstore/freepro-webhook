export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('=== WEBHOOK RECEBIDO ===');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    if (!req.body) {
      return res.status(200).json({ received: true, error: 'empty_body' });
    }
    
    const { Event, Data, IsTest } = req.body;
    
    console.log(`Evento: ${Event}`);
    console.log(`Teste: ${IsTest}`);
    
    // Eventos de pagamento da LastLink
    const paymentEvents = [
      'Subscription_Renewal_Pending',
      'Purchase_Approved', 
      'Purchase_Complete',
      'Payment_Approved'
    ];
    
    if (paymentEvents.includes(Event) && Data) {
      const email = Data.Buyer?.Email;
      const value = Data.Purchase?.Price?.Value || Data.Purchase?.OriginalPrice?.Value;
      const buyerName = Data.Buyer?.Name;
      
      console.log('=== PROCESSANDO PAGAMENTO ===');
      console.log(`Email: ${email}`);
      console.log(`Nome: ${buyerName}`);
      console.log(`Valor: R$ ${value}`);
      console.log(`Evento: ${Event}`);
      console.log(`É teste: ${IsTest ? 'SIM' : 'NÃO'}`);
      
      if (email && value) {
        // Converter para centavos para comparação
        const valueInCents = value * 100;
        
        let plan = 'monthly';
        let planName = 'Mensal - R$ 9,90';
        
        if (valueInCents >= 7990) {
          plan = 'annual';
          planName = 'Anual - R$ 79,90';
        } else if (valueInCents >= 4790) {
          plan = 'biannual';
          planName = 'Semestral - R$ 47,90';
        } else if (valueInCents >= 2690) {
          plan = 'quarterly';
          planName = 'Trimestral - R$ 26,90';
        }
        
        const password = Math.random().toString(36).slice(-8);
        const expiresAt = calculateExpiration(plan);
        
        console.log(`Plano identificado: ${planName}`);
        console.log(`Senha gerada: ${password}`);
        console.log(`Expira em: ${expiresAt.toLocaleDateString('pt-BR')}`);
        
        // Aqui criar no Firebase futuramente
        console.log('✅ Usuário processado para ativação');
        console.log('================================');
      }
    } else {
      console.log(`ℹ️ Evento ignorado: ${Event}`);
    }
    
    res.status(200).json({ 
      received: true, 
      timestamp: new Date().toISOString(),
      event: Event,
      processed: true
    });
    
  } catch (error) {
    console.error('❌ ERRO:', error.message);
    res.status(200).json({ 
      received: true,
      error: 'processed', 
      message: error.message
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
