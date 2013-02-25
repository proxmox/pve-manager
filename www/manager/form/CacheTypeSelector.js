Ext.define('PVE.form.CacheTypeSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.CacheTypeSelector'],
  
    initComponent: function() {
	var me = this;

	me.data = [
	    ['', 'Default (No cache)'],
	    ['directsync', 'Direct sync'],
	    ['writethrough', 'Write through'],
	    ['writeback', 'Write back'],
	    ['unsafe', 'Write back (unsafe)'],
	    ['none', 'No cache']
	];

	me.callParent();
    }
});
