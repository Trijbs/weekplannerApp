import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const faviconPath = path.join(publicDir, 'favicon.svg');
const iconsDir = path.join(publicDir, 'icons');
const splashDir = path.join(publicDir, 'splash');

// Brand colors
const BACKGROUND_COLOR = '#f2f6ff';
const THEME_COLOR = '#1d4ed8';

// Icon configurations
const iconConfigs = [
  { size: 120, filename: 'icon-120.png', description: 'Apple touch icon' },
  { size: 152, filename: 'icon-152.png', description: 'Apple touch icon iPad' },
  { size: 167, filename: 'icon-167.png', description: 'Apple touch icon iPad Pro' },
  { size: 180, filename: 'icon-180.png', description: 'Apple touch icon iPhone retina' },
  { size: 192, filename: 'icon-192.png', description: 'PWA icon' },
  { size: 512, filename: 'icon-512.png', description: 'PWA icon large' },
];

const maskableIconConfigs = [
  { size: 192, filename: 'icon-maskable-192.png', description: 'Maskable PWA icon 192x192' },
  { size: 512, filename: 'icon-maskable-512.png', description: 'Maskable PWA icon 512x512' },
];

// iOS splash screen configurations
const splashConfigs = [
  { width: 2048, height: 2732, filename: 'apple-splash-2048-2732.png', device: 'iPad Pro 12.9"' },
  { width: 1668, height: 2388, filename: 'apple-splash-1668-2388.png', device: 'iPad Pro 11"' },
  { width: 1290, height: 2796, filename: 'apple-splash-1290-2796.png', device: 'iPhone 15 Pro Max' },
  { width: 1179, height: 2556, filename: 'apple-splash-1179-2556.png', device: 'iPhone 15 Pro' },
  { width: 1170, height: 2532, filename: 'apple-splash-1170-2532.png', device: 'iPhone 14' },
  { width: 750, height: 1334, filename: 'apple-splash-750-1334.png', device: 'iPhone SE' },
];

/**
 * Creates a directory if it doesn't exist
 */
async function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✓ Created directory: ${dirPath}`);
  }
}

/**
 * Generates regular PNG icons from favicon.svg
 */
async function generateIcons() {
  console.log('\n📱 Generating PNG icons...\n');

  for (const config of iconConfigs) {
    try {
      const outputPath = path.join(iconsDir, config.filename);
      await sharp(faviconPath)
        .resize(config.size, config.size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png()
        .toFile(outputPath);
      console.log(`✓ Generated ${config.filename} (${config.size}x${config.size}) - ${config.description}`);
    } catch (error) {
      console.error(`✗ Failed to generate ${config.filename}:`, error.message);
    }
  }
}

/**
 * Generates maskable PNG icons with 20% padding for safe zone
 */
async function generateMaskableIcons() {
  console.log('\n🎭 Generating maskable PNG icons...\n');

  for (const config of maskableIconConfigs) {
    try {
      // Calculate padding: 20% of size means the icon occupies 80% of the space
      const paddingPercent = 0.2;
      const iconSize = Math.floor(config.size * (1 - paddingPercent));
      const padding = Math.floor(config.size * (paddingPercent / 2));

      // Create white background
      const background = await sharp({
        create: {
          width: config.size,
          height: config.size,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      }).png().toBuffer();

      // Resize icon and composite on white background
      const outputPath = path.join(iconsDir, config.filename);
      const resizedIcon = await sharp(faviconPath)
        .resize(iconSize, iconSize, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png()
        .toBuffer();

      await sharp(background)
        .composite([
          {
            input: resizedIcon,
            top: padding,
            left: padding,
          },
        ])
        .toFile(outputPath);

      console.log(`✓ Generated ${config.filename} (${config.size}x${config.size}) - ${config.description}`);
    } catch (error) {
      console.error(`✗ Failed to generate ${config.filename}:`, error.message);
    }
  }
}

/**
 * Generates iOS splash screens with centered icon
 */
async function generateSplashScreens() {
  console.log('\n🖼️  Generating iOS splash screens...\n');

  // Create centered 120px icon for splash screens
  const iconSize = 120;
  const iconBuffer = await sharp(faviconPath)
    .resize(iconSize, iconSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png()
    .toBuffer();

  for (const config of splashConfigs) {
    try {
      // Create background with brand color
      const bgBuffer = Buffer.from(
        `<svg width="${config.width}" height="${config.height}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${config.width}" height="${config.height}" fill="${BACKGROUND_COLOR}"/>
        </svg>`
      );

      // Calculate centered position
      const iconLeft = Math.floor((config.width - iconSize) / 2);
      const iconTop = Math.floor((config.height - iconSize) / 2);

      const outputPath = path.join(splashDir, config.filename);
      await sharp(bgBuffer)
        .resize(config.width, config.height)
        .composite([
          {
            input: iconBuffer,
            top: iconTop,
            left: iconLeft,
          },
        ])
        .png()
        .toFile(outputPath);

      console.log(`✓ Generated ${config.filename} (${config.width}x${config.height}) - ${config.device}`);
    } catch (error) {
      console.error(`✗ Failed to generate ${config.filename}:`, error.message);
    }
  }
}

/**
 * Verifies all generated files
 */
async function verifyFiles() {
  console.log('\n📋 Verifying generated files...\n');

  const allConfigs = [
    ...iconConfigs.map(c => ({ dir: iconsDir, ...c })),
    ...maskableIconConfigs.map(c => ({ dir: iconsDir, ...c })),
    ...splashConfigs.map(c => ({ dir: splashDir, ...c })),
  ];

  let successCount = 0;
  let failureCount = 0;

  for (const config of allConfigs) {
    const filePath = path.join(config.dir, config.filename);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const sizeKb = (stats.size / 1024).toFixed(2);
      console.log(`✓ ${config.filename} (${sizeKb} KB)`);
      successCount++;
    } else {
      console.log(`✗ ${config.filename} - NOT FOUND`);
      failureCount++;
    }
  }

  console.log(`\n✅ Verification complete: ${successCount} files created, ${failureCount} failed\n`);
  return failureCount === 0;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 Starting icon and splash screen generation...\n');
    console.log(`Source: ${faviconPath}`);
    console.log(`Icons output: ${iconsDir}`);
    console.log(`Splash output: ${splashDir}\n`);

    // Ensure directories exist
    await ensureDir(iconsDir);
    await ensureDir(splashDir);

    // Generate all assets
    await generateIcons();
    await generateMaskableIcons();
    await generateSplashScreens();

    // Verify all files
    const allSuccess = await verifyFiles();

    if (allSuccess) {
      console.log('🎉 All assets generated successfully!\n');
      process.exit(0);
    } else {
      console.log('⚠️  Some files failed to generate\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
