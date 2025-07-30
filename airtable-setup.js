// airtable-setup.js
// Helper functions for Airtable integration

class AirtableManager {
  constructor(apiKey, baseId, tableId) {
    this.apiKey = apiKey;
    this.baseId = baseId;
    this.tableId = tableId;
    this.baseUrl = `https://api.airtable.com/v0/${baseId}/${tableId}`;
  }

  // Create table structure (run once)
  async setupTable() {
    // Airtable schema for motorcycle classes
    const tableSchema = {
      name: "Motorcycle Classes",
      fields: [
        { name: "Title", type: "singleLineText" },
        { name: "Provider", type: "singleLineText" },
        { name: "Date", type: "date" },
        { name: "Time", type: "singleLineText" },
        { name: "Location", type: "singleLineText" },
        { name: "Price", type: "currency", options: { precision: 2 } },
        { name: "Type", type: "singleSelect", options: {
          choices: [
            { name: "Basic Rider Course" },
            { name: "Intermediate Course" },
            { name: "Advanced Course" },
            { name: "Refresher Course" },
            { name: "Motorcycle Safety Course" }
          ]
        }},
        { name: "Link", type: "url" },
        { name: "Region", type: "singleLineText" },
        { name: "Last Updated", type: "dateTime" },
        { name: "Status", type: "singleSelect", options: {
          choices: [
            { name: "Active" },
            { name: "Full" },
            { name: "Cancelled" },
            { name: "Past" }
          ]
        }}
      ]
    };

    console.log("Manual setup required:");
    console.log("1. Go to https://airtable.com/create/base");
    console.log("2. Create a new base called 'Motorcycle Classes'");
    console.log("3. Add the fields shown in the schema above");
    console.log("4. Get your API key from https://airtable.com/account");
    console.log("5. Get your base ID from the API documentation");
  }

  async getAllClasses() {
    try {
      const response = await fetch(`${this.baseUrl}?sort[0][field]=Date&sort[0][direction]=asc`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.records.map(record => ({
        id: record.id,
        ...record.fields
      }));
    } catch (error) {
      console.error('Error fetching classes:', error);
      return [];
    }
  }

  async addClasses(classes) {
    // Clear existing records first (optional)
    await this.clearOldRecords();

    // Add new records in batches
    const batches = this.createBatches(classes, 10);
    
    for (const batch of batches) {
      try {
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            records: batch.map(cls => ({ fields: cls }))
          })
        });

        if (!response.ok) {
          const error = await response.text();
          console.error('Airtable batch error:', error);
        } else {
          console.log(`Successfully added batch of ${batch.length} classes`);
        }
      } catch (error) {
        console.error('Error adding batch:', error);
      }

      // Rate limiting - Airtable allows 5 requests per second
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  async clearOldRecords() {
    try {
      const existing = await this.getAllClasses();
      const recordIds = existing.map(record => record.id);
      
      // Delete in batches of 10
      const batches = this.createBatches(recordIds, 10);
      
      for (const batch of batches) {
        const response = await fetch(`${this.baseUrl}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            records: batch
          })
        });

        if (response.ok) {
          console.log(`Deleted batch of ${batch.length} old records`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    } catch (error) {
      console.error('Error clearing old records:', error);
    }
  }

  createBatches(array, size) {
    const batches = [];
    for (let i = 0; i < array.length; i += size) {
      batches.push(array.slice(i, i + size));
    }
    return batches;
  }

  // Generate public API endpoint for your website
  generatePublicEndpoint() {
    return `https://api.airtable.com/v0/${this.baseId}/${this.tableId}?view=Grid%20view`;
  }
}

// Example usage for frontend integration
class MotorcycleClassesAPI {
  constructor(airtableManager) {
    this.airtable = airtableManager;
  }

  async getUpcomingClasses(limit = 50) {
    const classes = await this.airtable.getAllClasses();
    const today = new Date();
    
    return classes
      .filter(cls => new Date(cls.Date) >= today)
      .sort((a, b) => new Date(a.Date) - new Date(b.Date))
      .slice(0, limit);
  }

  async getClassesByProvider(provider) {
    const classes = await this.airtable.getAllClasses();
    return classes.filter(cls => cls.Provider === provider);
  }

  async getClassesByRegion(region = 'Southern California') {
    const classes = await this.airtable.getAllClasses();
    return classes.filter(cls => cls.Region === region);
  }

  async searchClasses(query) {
    const classes = await this.airtable.getAllClasses();
    const searchTerm = query.toLowerCase();
    
    return classes.filter(cls => 
      cls.Title?.toLowerCase().includes(searchTerm) ||
      cls.Provider?.toLowerCase().includes(searchTerm) ||
      cls.Location?.toLowerCase().includes(searchTerm) ||
      cls.Type?.toLowerCase().includes(searchTerm)
    );
  }

  // Generate JSON feed for your website
  async generateJSONFeed() {
    const classes = await this.getUpcomingClasses();
    
    return {
      title: "Southern California Motorcycle Classes",
      description: "Comprehensive schedule of motorcycle safety courses",
      lastUpdated: new Date().toISOString(),
      classes: classes.map(cls => ({
        id: cls.id,
        title: cls.Title,
        provider: cls.Provider,
        date: cls.Date,
        time: cls.Time,
        location: cls.Location,
        price: cls.Price,
        type: cls.Type,
        registrationLink: cls.Link
      }))
    };
  }
}

// Frontend integration example (for your low-code tool)
const frontendIntegration = {
  // Webhook endpoint for real-time updates
  webhook: async (req, res) => {
    const airtable = new AirtableManager(
      process.env.AIRTABLE_API_KEY,
      process.env.AIRTABLE_BASE_ID,
      process.env.AIRTABLE_TABLE_ID
    );
    
    const api = new MotorcycleClassesAPI(airtable);
    const feed = await api.generateJSONFeed();
    
    res.json(feed);
  },

  // JavaScript for embedding in your website
  embeddableWidget: `
    <div id="motorcycle-classes-widget"></div>
    <script>
      async function loadMotorcycleClasses() {
        try {
          const response = await fetch('/api/motorcycle-classes');
          const data = await response.json();
          
          const widget = document.getElementById('motorcycle-classes-widget');
          widget.innerHTML = data.classes.map(cls => \`
            <div class="class-card">
              <h3>\${cls.title}</h3>
              <div class="provider">\${cls.provider}</div>
              <div class="date">\${new Date(cls.date).toLocaleDateString()}</div>
              <div class="location">\${cls.location}</div>
              <div class="price">\${cls.price ? '$' + cls.price : 'Contact for pricing'}</div>
              <a href="\${cls.registrationLink}" target="_blank">Register</a>
            </div>
          \`).join('');
        } catch (error) {
          console.error('Error loading classes:', error);
        }
      }
      
      loadMotorcycleClasses();
    </script>
  `
};

module.exports = {
  AirtableManager,
  MotorcycleClassesAPI,
  frontendIntegration
};
