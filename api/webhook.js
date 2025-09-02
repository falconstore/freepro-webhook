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
    
    // Eventos que ATIVAM conta baseado nos eventos reais da LastLink
    const activationEvents = [
      'Purchase_Order_Confirmed',  // Pedido de Compra Confirmado
      'Recurrent_Payment',         // Pagamento Recorrente/Renovação
      'Purchase_Approved',         // Compra Aprovada
      'Payment_Approved'           // Pagamento Aprovado
    ];
    
    if (activationEvents.includes(Event) && Data && !IsTest) {
      const email = Data.Buyer?.Email;
      const value = Data.Purchase?.Price?.Value || Data.Purchase?.OriginalPrice?.Value;
      const paymentMethod = Data.Purchase?.Payment?.PaymentMethod;
      const buyerName = Data.Buyer?.Name;
      const paymentDate = Data.Purchase?.PaymentDate;
      
      if (email && value) {
        console.log('=== ATIVANDO CONTA ===');
        console.log(`Email: ${email}`);
        console.log(`Nome: ${buyerName}`);
        console.log(`Valor: R$ ${value}`);
        console.log(`Método: ${paymentMethod}`);
        console.log(`Data Pagamento: ${paymentDate}`);
        
        // Determinar plano pelo valor (LastLink usa decimais, não centavos)
        let plan = 'monthly';
        let planName = 'Mensal - R$ 9,90';
        
        if (value >= 79.90) {
          plan = 'annual';
          planName = 'Anual - R$ 79,90';
        } else if (value >= 47.90) {
          plan = 'biannual';
          planName = 'Semestral - R$ 47,90';
        } else if (value >= 26.90) {
          plan = 'quarterly';
          planName = 'Trimestral - R$ 26,90';
        } else if (value >= 9.90) {
          plan = 'monthly';
          planName = 'Mensal - R$ 9,90';
        }
        
        const password = Math.random().toString(36).slice(-8);
        const expiresAt = calculateExpiration(plan);
        
        console.log(`Plano identificado: ${planName}`);
        console.log(`Senha gerada: ${password}`);
        console.log(`Expira em: ${expiresAt.toLocaleDateString('pt-BR')}`);
        
        const userData = {
          email: email,
          name: buyerName,
          password: password,
          plan: plan,
          planName: planName,
          status: 'active',
          expiresAt: expiresAt.toISOString(),
          createdAt: new Date().toISOString(),
          activatedBy: 'webhook',
          paymentAmount: value,
          paymentMethod: paymentMethod,
          lastPaymentDate: paymentDate
        };
        
        console.log('Dados do usuário:', JSON.stringify(userData, null, 2));
        
        // TODO: Criar no Firebase
        // await createUserInFirebase(userData);
        
        console.log('✅ Conta ativada com sucesso');
        console.log('================================');
      }
    } 
    else if (IsTest) {
      console.log('⚠️ Evento de teste ignorado automaticamente');
    }
    else {
      console.log(`ℹ️ Evento não processado: ${Event}`);
    }
    
    res.status(200).json({ 
      received: true, 
      timestamp: new Date().toISOString(),
      event: Event,
      processed: !IsTest,
      isTest: IsTest
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
