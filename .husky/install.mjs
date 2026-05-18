// Skip if husky is not installed (CI, production, embedded installs with --omit=dev)
try {
  const husky = await import('husky');
  husky.default();
} catch (e) {
  if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
}
