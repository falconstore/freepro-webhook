export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('=== WEBHOOK LASTLINK ===');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    if (!req.body) {
      return res.status(200).json({ received: true, error: 'empty_body' });
    }
    
    const { Event, Data, IsTest } = req.body;
    
    console.log(`Evento: ${Event}`);
    console.log(`É teste: ${IsTest ? 'SIM' : 'NÃO'}`);
    
    // Eventos que ATIVAM conta
    const activationEvents = [
      'Purchase_Complete', // Compra Completa
      'Subscription_Renewal_Complete', // Renovação Completa
      'Payment_Approved' // Pagamento Aprovado
    ];
    
    // Eventos que DESATIVAM conta
    const deactivationEvents = [
      'Subscription_Expired', // Assinatura Expirada
      'Subscription_Cancelled' // Assinatura Cancelada
    ];
    
    if (activationEvents.includes(Event) && Data) {
      const email = Data.Buyer?.Email;
      const value = Data.Purchase?.Price?.Value || Data.Purchase?.OriginalPrice?.Value;
      const paymentMethod = Data.Purchase?.Payment?.PaymentMethod;
      const buyerName = Data.Buyer?.Name;
      
      if (email && value && !IsTest) { // Só processar se NÃO for teste
        console.log('=== ATIVANDO CONTA ===');
        console.log(`Email: ${email}`);
        console.log(`Nome: ${buyerName}`);
        console.log(`Valor: R$ ${value}`);
        console.log(`Método: ${paymentMethod}`);
        
        // Determinar plano pelo valor
        let plan = 'monthly';
        if (value >= 79.90) plan = 'annual';
        else if (value >= 47.90) plan = 'biannual';
        else if (value >= 26.90) plan = 'quarterly';
        
        const password = Math.random().toString(36).slice(-8);
        const expiresAt = calculateExpiration(plan);
        
        console.log(`Plano: ${plan}`);
        console.log(`Senha: ${password}`);
        console.log(`Expira: ${expiresAt.toLocaleDateString('pt-BR')}`);
        
        // TODO: Criar no Firebase
        console.log('✅ Conta ativada');
      } else if (IsTest) {
        console.log('⚠️ Evento de teste ignorado');
      }
    } 
    else if (deactivationEvents.includes(Event) && Data) {
      const email = Data.Member?.Email || Data.Buyer?.Email;
      console.log(`❌ Desativando conta: ${email}`);
      // TODO: Desativar no Firebase
    }
    else {
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
