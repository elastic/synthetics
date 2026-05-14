// Skip if husky is not installed (CI, production, embedded installs with --omit=dev)
try {
  const husky = await import('husky');
  husky.default();
} catch {
  // husky not a dependency, skip
}
