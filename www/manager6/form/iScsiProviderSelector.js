Ext.define('PVE.form.iScsiProviderSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveiScsiProviderSelector'],
    comboItems: [
	['comstar', 'Comstar'],
	[ 'istgt', 'istgt'],
	[ 'iet', 'IET']
    ]
});
