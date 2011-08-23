// boolean type including 'Default' (delete property from file)
Ext.define('PVE.form.Boolean', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.booleanfield'],
  
    initComponent: function() {
	var me = this;

	me.data = [
	    ['', 'Default'],
	    [1, 'Yes'],
	    [0, 'No']
	];

	me.callParent();
    }
});
