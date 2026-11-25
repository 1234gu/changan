// The standalone task console also styles native elements. Limit those rules to
// its route when compiling the two modules into the same document.
export default {
  plugins: [{
    postcssPlugin: 'scope-task-console',
    Once(root) {
      if (!root.source?.input.file?.includes('/web/src/')) return;
      root.walkRules(rule => {
        if (rule.parent?.type === 'atrule' && rule.parent.name.endsWith('keyframes')) return;
        rule.selectors = rule.selectors.map(selector =>
          selector === ':root' || selector === 'body' ? '.task-surface' : '.task-surface ' + selector,
        );
      });
    },
  }],
};
