Ext.define('PVE.form.BondModeSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: ['widget.bondModeSelector'],
  
    initComponent: function() {
	var me = this;

	var store = Ext.create('Ext.data.ArrayStore', {
	    model: 'KeyValue',
            data : [ 
		['balance-rr', ''], 
		['active-backup', ''], 
		['balance-xor', ''], 
		['broadcast', ''], 
		['802.3ad', ''], 
		['balance-tlb', ''], 
		['balance-alb', ''], 
	    ]
        });

	Ext.apply(me, {
	    store: store,
	    queryMode: 'local',
	    editable: false,
	    displayField: 'key',
	    valueField: 'key'
	});

	me.callParent();
    }
});
