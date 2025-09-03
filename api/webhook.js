async function sendWelcomeEmail(email, password, plan) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev', // Email padrão do Resend (temporário)
        to: email,
        subject: 'FreePro - Conta Ativada com Sucesso!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #3b82f6, #22c55e); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; font-size: 28px;">Bem-vindo ao FreePro!</h1>
              <p style="margin: 10px 0 0; font-size: 18px;">Sua conta foi ativada com sucesso</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px;">
              <h2 style="color: #333; margin-top: 0;">Seus dados de acesso:</h2>
              
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                <p style="margin: 0 0 10px;"><strong>Email:</strong> ${email}</p>
                <p style="margin: 0 0 10px;"><strong>Senha:</strong> <code style="background: #e5e7eb; padding: 4px 8px; border-radius: 4px; font-size: 16px;">${password}</code></p>
                <p style="margin: 0;"><strong>Plano:</strong> ${plan}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://www.freepro.com.br" style="background: linear-gradient(135deg, #3b82f6, #22c55e); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Acessar FreePro Agora</a>
              </div>
              
              <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 6px; margin-top: 20px;">
                <p style="margin: 0; color: #856404;"><strong>Importante:</strong> Guarde seus dados de acesso em local seguro.</p>
              </div>
              
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
              
              <p style="font-size: 14px; color: #666; margin: 0;">
                FreePro - Calculadoras Profissionais<br>
                Este é um email automático.
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
