const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'storefront', 'pages');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

const insertText = 
    <div><h4>Delivery Areas</h4><ul>
      <li><a href="/delivery/capitol-hill">Capitol Hill</a></li>
      <li><a href="/delivery/columbia-heights">Columbia Heights</a></li>
    </ul></div>;

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Only insert if it doesn't already have it
  if (!content.includes('Delivery Areas')) {
    content = content.replace(/(<div><h4>Visit &amp; Connect<\/h4>[\s\S]*?<\/ul><\/div>)/, $1);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated', file);
  } else {
    console.log('Skipped', file);
  }
});
