const puppeteer = require('puppeteer');

async function testBasicScraping() {
  console.log('🧪 Testing basic web scraping...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    // Test the simplest site first
    console.log('🔍 Testing RideRite website...');
    await page.goto('https://shopriderite.net/product-category/basic/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('✅ Page loaded successfully');
    
    // Check what's actually on the page
    const title = await page.title();
    console.log('📄 Page title:', title);
    
    // Look for any products
    const productCount = await page.evaluate(() => {
      const products = document.querySelectorAll('.product, .woocommerce-loop-product, .course, .class');
      console.log('Found elements:', products.length);
      return products.length;
    });
    
    console.log('🛍️ Products found:', productCount);
    
    // Get page content sample
    const bodyText = await page.evaluate(() => {
      return document.body.innerText.substring(0, 500);
    });
    
    console.log('📝 Page content sample:', bodyText);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  await browser.close();
}

testBasicScraping();
