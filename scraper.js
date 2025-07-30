const puppeteer = require('puppeteer');
const fs = require('fs').promises;

class MotorcycleClassScraper {
  constructor() {
    this.browser = null;
    this.classes = [];
    this.airtableConfig = {
      baseId: process.env.AIRTABLE_BASE_ID,
      tableId: process.env.AIRTABLE_TABLE_ID,
      apiKey: process.env.AIRTABLE_API_KEY
    };
  }

  async init() {
    console.log('🔧 Initializing browser...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('✅ Browser ready');
  }

  async scrapeShopRideRite() {
    console.log('🏪 Scraping RideRite...');
    const page = await this.browser.newPage();
    try {
      await page.goto('https://shopriderite.net/product-category/basic/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      console.log('📄 RideRite page loaded');

      const classes = await page.evaluate(() => {
        const products = document.querySelectorAll('.product, .woocommerce-loop-product, .course-item');
        console.log('Found product elements:', products.length);
        
        return Array.from(products).map(product => {
          const title = product.querySelector('.woocommerce-loop-product__title, h3, h2, .title')?.textContent?.trim();
          const price = product.querySelector('.price, .cost')?.textContent?.trim();
          const link = product.querySelector('a')?.href;
          
          if (!title) return null;
          
          return {
            title,
            price,
            link,
            provider: 'RideRite',
            type: 'Basic Course'
          };
        }).filter(Boolean);
      });

      console.log(`📋 RideRite found ${classes.length} classes`);
      this.classes.push(...classes);
    } catch (error) {
      console.error('❌ Error scraping RideRite:', error.message);
    } finally {
      await page.close();
    }
  }

  async scrapeMSIRegistration(url, provider) {
    const page = await this.browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle2' });
      
      // Wait for React app to load
      await page.waitForSelector('[data-testid="class-listing"], .class-item, .course-item', {
        timeout: 10000
      });

      const classes = await page.evaluate(() => {
        // Look for various class listing patterns
        const selectors = [
          '.class-item',
          '.course-item',
          '[data-testid="class-listing"]',
          '.schedule-item'
        ];
        
        let elements = [];
        for (const selector of selectors) {
          elements = document.querySelectorAll(selector);
          if (elements.length > 0) break;
        }

        return Array.from(elements).map(item => {
          const title = item.querySelector('h3, h4, .title, .class-title')?.textContent?.trim();
          const date = item.querySelector('.date, .schedule-date')?.textContent?.trim();
          const location = item.querySelector('.location, .venue')?.textContent?.trim();
          const price = item.querySelector('.price, .cost')?.textContent?.trim();
          
          return {
            title,
            date,
            location,
            price,
            provider,
            link: window.location.href
          };
        });
      });

      this.classes.push(...classes);
    } catch (error) {
      console.error(`Error scraping ${provider}:`, error);
    } finally {
      await page.close();
    }
  }

  async scrapeHarleyDavidson() {
    const page = await this.browser.newPage();
    try {
      await page.goto('https://riders.harley-davidson.com/s/?language=en_US#99992&expLvl=NRC', {
        waitUntil: 'networkidle2'
      });

      // Wait for classes to load
      await page.waitForSelector('.class-card, .course-card', { timeout: 15000 });

      const classes = await page.evaluate(() => {
        const cards = document.querySelectorAll('.class-card, .course-card, [data-testid="class"]');
        return Array.from(cards).map(card => {
          const title = card.querySelector('h3, h4, .title')?.textContent?.trim();
          const date = card.querySelector('.date')?.textContent?.trim();
          const location = card.querySelector('.location')?.textContent?.trim();
          
          return {
            title,
            date,
            location,
            provider: 'Harley Davidson',
            type: 'New Rider Course'
          };
        });
      });

      this.classes.push(...classes);
    } catch (error) {
      console.error('Error scraping Harley Davidson:', error);
    } finally {
      await page.close();
    }
  }

  async scrapeCommunityEd(url, provider) {
    const page = await this.browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle2' });

      const classes = await page.evaluate(() => {
        // Look for table rows or class listings
        const rows = document.querySelectorAll('tr, .class-row, .course-listing');
        return Array.from(rows).map(row => {
          const cells = row.querySelectorAll('td, .cell, .info');
          if (cells.length < 3) return null;

          const title = cells[0]?.textContent?.trim();
          const date = cells[1]?.textContent?.trim();
          const time = cells[2]?.textContent?.trim();
          const location = cells[3]?.textContent?.trim();

          return title ? {
            title,
            date,
            time,
            location,
            provider,
            type: 'Motorcycle Safety Course'
          } : null;
        }).filter(Boolean);
      });

      this.classes.push(...classes);
    } catch (error) {
      console.error(`Error scraping ${provider}:`, error);
    } finally {
      await page.close();
    }
  }

  async scrapeAll() {
    console.log('🚀 Starting scraper...');
    await this.init();

    // Define all sources
    const sources = [
      { 
        name: 'RideRite',
        type: 'riderite', 
        fn: () => this.scrapeShopRideRite() 
      }
    ];

    console.log(`📝 Will scrape ${sources.length} sources...`);

    // Run scrapers one by one with detailed logging
    for (const source of sources) {
      console.log(`🔍 Scraping ${source.name}...`);
      try {
        const beforeCount = this.classes.length;
        await source.fn();
        const afterCount = this.classes.length;
        const foundNew = afterCount - beforeCount;
        console.log(`✅ ${source.name}: Found ${foundNew} new classes (total: ${afterCount})`);
      } catch (error) {
        console.error(`❌ ${source.name} failed:`, error.message);
      }
    }

    await this.browser.close();
    console.log(`🎉 Scraping complete! Total classes found: ${this.classes.length}`);
    
    if (this.classes.length > 0) {
      console.log('📊 Sample classes:', JSON.stringify(this.classes.slice(0, 2), null, 2));
    }
    
    return this.normalizeData();
  }

  normalizeData() {
    return this.classes.map(cls => ({
      id: this.generateId(cls),
      title: cls.title || 'Motorcycle Safety Course',
      provider: cls.provider || 'Unknown',
      date: this.parseDate(cls.date),
      time: cls.time || '',
      location: cls.location || 'Southern California',
      price: this.parsePrice(cls.price),
      type: cls.type || 'Motorcycle Course',
      link: cls.link || '',
      lastUpdated: new Date().toISOString(),
      region: 'Southern California'
    }));
  }

  generateId(cls) {
    const str = `${cls.provider}-${cls.title}-${cls.date}`;
    return Buffer.from(str).toString('base64').slice(0, 12);
  }

  parseDate(dateStr) {
    if (!dateStr) return null;
    // Handle various date formats
    const cleaned = dateStr.replace(/[^\d\/\-\s]/g, '');
    const date = new Date(cleaned);
    return date.toString() !== 'Invalid Date' ? date.toISOString().split('T')[0] : null;
  }

  parsePrice(priceStr) {
    if (!priceStr) return null;
    const match = priceStr.match(/\$(\d+(?:\.\d{2})?)/);
    return match ? parseFloat(match[1]) : null;
  }

  async saveToAirtable(data) {
    if (!this.airtableConfig.apiKey) {
      console.log('No Airtable config found, saving to JSON instead');
      await this.saveToJSON(data);
      return;
    }

    const fetch = require('node-fetch');
    const url = `https://api.airtable.com/v0/${this.airtableConfig.baseId}/${this.airtableConfig.tableId}`;

    // Batch insert records (Airtable limit: 10 per request)
    const batches = [];
    for (let i = 0; i < data.length; i += 10) {
      batches.push(data.slice(i, i + 10));
    }

    for (const batch of batches) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.airtableConfig.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            records: batch.map(record => ({ fields: record }))
          })
        });

        if (!response.ok) {
          console.error('Airtable error:', await response.text());
        }
      } catch (error) {
        console.error('Error saving batch to Airtable:', error);
      }
    }
  }

  async saveToJSON(data) {
    const filename = `motorcycle-classes-${new Date().toISOString().split('T')[0]}.json`;
    console.log(`💾 Saving ${data.length} classes to ${filename}`);
    
    try {
      await fs.writeFile(filename, JSON.stringify(data, null, 2));
      console.log(`✅ Successfully saved to ${filename}`);
      
      // Also create a summary file
      const summary = {
        totalClasses: data.length,
        providers: [...new Set(data.map(c => c.provider))],
        lastUpdated: new Date().toISOString(),
        sampleClass: data[0] || null
      };
      
      await fs.writeFile('summary.json', JSON.stringify(summary, null, 2));
      console.log('📊 Summary saved to summary.json');
      
    } catch (error) {
      console.error('❌ Error saving JSON:', error);
    }
  }

  async saveToAirtable(data) {
    if (!this.airtableConfig.apiKey) {
      console.log('⚠️  No Airtable API key found, saving to JSON only');
      await this.saveToJSON(data);
      return;
    }

    console.log(`🔗 Connecting to Airtable with base: ${this.airtableConfig.baseId}`);
    console.log(`📋 Table: ${this.airtableConfig.tableId}`);
    
    const fetch = require('node-fetch');
    const url = `https://api.airtable.com/v0/${this.airtableConfig.baseId}/${this.airtableConfig.tableId}`;
    
    console.log(`📡 Airtable URL: ${url}`);

    // Test connection first
    try {
      console.log('🧪 Testing Airtable connection...');
      const testResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.airtableConfig.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        console.error('❌ Airtable connection test failed:', testResponse.status, errorText);
        console.log('💾 Falling back to JSON save...');
        await this.saveToJSON(data);
        return;
      }
      
      console.log('✅ Airtable connection successful');
    } catch (error) {
      console.error('❌ Airtable connection error:', error.message);
      console.log('💾 Falling back to JSON save...');
      await this.saveToJSON(data);
      return;
    }

    // Save data in batches
    const batches = [];
    for (let i = 0; i < data.length; i += 10) {
      batches.push(data.slice(i, i + 10));
    }

    console.log(`📦 Sending ${batches.length} batches to Airtable...`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📤 Sending batch ${i + 1}/${batches.length} (${batch.length} records)`);
      
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.airtableConfig.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            records: batch.map(record => ({ fields: record }))
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Batch ${i + 1} failed:`, response.status, errorText);
        } else {
          console.log(`✅ Batch ${i + 1} successful`);
        }
      } catch (error) {
        console.error(`❌ Error sending batch ${i + 1}:`, error.message);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    
    // Also save to JSON as backup
    await this.saveToJSON(data);
  }
}

// Usage
async function main() {
  console.log('🏁 Starting motorcycle class scraper...');
  const scraper = new MotorcycleClassScraper();
  try {
    const classes = await scraper.scrapeAll();
    console.log(`📈 Final result: ${classes.length} classes processed`);
    
    if (classes.length > 0) {
      console.log('💾 Attempting to save to Airtable...');
      await scraper.saveToAirtable(classes);
      console.log('✅ Save completed');
    } else {
      console.log('⚠️  No classes found - saving empty result for debugging');
      await scraper.saveToJSON([]);
    }
  } catch (error) {
    console.error('💥 Scraping failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = MotorcycleClassScraper;
