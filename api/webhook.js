export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('=== DEBUG VARIÁVEIS ===');
    console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID);
    console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL);
    console.log('FIREBASE_PRIVATE_KEY presente:', !!process.env.FIREBASE_PRIVATE_KEY);
    console.log('SENDGRID_API_KEY presente:', !!process.env.SENDGRID_API_KEY);
    
    return res.status(200).json({ 
      debug: {
        project_id: process.env.FIREBASE_PROJECT_ID,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key_exists: !!process.env.FIREBASE_PRIVATE_KEY,
        sendgrid_exists: !!process.env.SENDGRID_API_KEY
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({ error: error.message });
  }
}
