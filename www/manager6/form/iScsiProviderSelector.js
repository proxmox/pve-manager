Ext.define('PVE.form.iScsiProviderSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveiScsiProviderSelector'],
  
    initComponent: function() {
	var me = this;

	me.data = [
	    ['comstar', 'Comstar'],
	    [ 'istgt', 'istgt'],
	    [ 'iet', 'IET']
	];

	me.callParent();
    }
});
