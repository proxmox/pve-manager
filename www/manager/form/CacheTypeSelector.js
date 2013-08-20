Ext.define('PVE.form.CacheTypeSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.CacheTypeSelector'],
  
    initComponent: function() {
	var me = this;

	me.data = [
	    ['', gettext('Default') + " (" + gettext('No cache') + ")"],
	    ['directsync', 'Direct sync'],
	    ['writethrough', 'Write through'],
	    ['writeback', 'Write back'],
	    ['unsafe', 'Write back (' + gettext('unsafe') + ')'],
	    ['none', gettext('No cache')]
	];

	me.callParent();
    }
});
