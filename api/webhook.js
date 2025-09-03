export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('=== WEBHOOK RECEBIDO ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Body:', JSON.stringify(req.body));
    
    if (!req.body) {
      console.log('⚠️ Body vazio recebido');
      return res.status(200).json({ 
        received: true, 
        error: 'empty_body',
        timestamp: new Date().toISOString()
      });
    }
    
    const { event, data } = req.body;
    
    if (!event) {
      console.log('⚠️ Campo "event" não encontrado');
      return res.status(200).json({ 
        received: true, 
        error: 'missing_event',
        timestamp: new Date().toISOString()
      });
    }
    
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
      
      const { customer_email, amount, status, transaction_id } = data;
      
      // Determinar plano
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
        
        // Enviar email
        const emailSent = await sendWelcomeEmail(customer_email, password, planName);
        
        if (emailSent) {
          console.log('✅ Email enviado com sucesso');
        } else {
          console.log('❌ Falha ao enviar email');
        }
        
        console.log('✅ Processado com sucesso');
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

async function sendWelcomeEmail(email, password, plan) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: email,
        subject: 'FreePro - Conta Ativada com Sucesso!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #3b82f6, #22c55e); color: white; padding: 30px; text-align: center;">
              <h1 style="margin: 0;">Bem-vindo ao FreePro!</h1>
              <p style="margin: 10px 0 0;">Sua conta foi ativada com sucesso</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 30px;">
              <h2 style="color: #333; margin-top: 0;">Seus dados de acesso:</h2>
              
              <div style="background: white; padding: 20px; border-left: 4px solid #3b82f6;">
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Senha:</strong> ${password}</p>
                <p><strong>Plano:</strong> ${plan}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://www.freepro.com.br" style="background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px;">Acessar FreePro</a>
              </div>
              
              <p style="font-size: 14px; color: #666;">
                Guarde seus dados em local seguro.
              </p>
            </div>
          </div>
        `
      })
    });
    
    if (response.ok) {
      console.log('📧 Email enviado para:', email);
      return true;
    } else {
      const error = await response.text();
      console.error('Erro na API Resend:', error);
      return false;
    }
  } catch (error) {
    console.error('Erro ao enviar email:', error);
    return false;
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
