import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
try {
  await access(manifestPath);
  let xml = await readFile(manifestPath, 'utf8');
  xml = xml.replace(/(<activity\s[\s\S]*?)(>)/, (_, activity, end) => {
    activity = activity.replace(/\s+android:screenOrientation="[^"]*"/, '').trimEnd();
    return activity + '\n            android:screenOrientation="sensorLandscape"' + end;
  });
  await writeFile(manifestPath, xml);
} catch (error) { if (error.code !== 'ENOENT') throw error; }

const plistPath = path.join(root, 'ios/App/App/Info.plist');
try {
  await access(plistPath);
  const xml = await readFile(plistPath, 'utf8');
  const dom = new JSDOM(xml, { contentType: 'text/xml' });
  const document = dom.window.document;
  const dictionary = document.querySelector('plist > dict');
  if (!dictionary) throw new Error('No root dictionary in iOS Info.plist');
  function setValue(key, value) {
    for (const node of [...document.querySelectorAll('key')]) {
      if (node.textContent !== key) continue;
      node.nextElementSibling?.remove();
      node.remove();
    }
    const name = document.createElement('key'); name.textContent = key;
    dictionary.append(name, value);
  }
  for (const key of ['UISupportedInterfaceOrientations', 'UISupportedInterfaceOrientations~ipad']) {
    const array = document.createElement('array');
    for (const orientation of ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']) {
      const value = document.createElement('string'); value.textContent = orientation; array.append(value);
    }
    setValue(key, array);
  }
  for (const key of ['UIRequiresFullScreen', 'UIStatusBarHidden']) {
    setValue(key, document.createElement('true'));
  }
  setValue('UIViewControllerBasedStatusBarAppearance', document.createElement('false'));
  await writeFile(plistPath, '<?xml version="1.0" encoding="UTF-8"?>\n' + dom.serialize() + '\n');
  dom.window.close();
} catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log('Native landscape orientation configured for Android and iOS.');
for (const file of ['ios/App/App.xcodeproj/project.pbxproj', 'ios/App/CapApp-SPM/Package.swift']) {
  const filename = path.join(root, file);
  try {
    let content = await readFile(filename, 'utf8');
    content = content.replace(/IPHONEOS_DEPLOYMENT_TARGET = [\d.]+;/g, 'IPHONEOS_DEPLOYMENT_TARGET = 17.0;')
      .replace(/\.iOS\(\.v\d+\)/g, '.iOS(.v17)');
    await writeFile(filename, content);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
