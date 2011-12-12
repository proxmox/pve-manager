Ext.define('PVE.form.DayOfWeekSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveDayOfWeekSelector'],
  
    initComponent: function() {
	var me = this;

	me.data = [
	    ['mon', Ext.Date.dayNames[0]],
	    ['tue', Ext.Date.dayNames[1]],
	    ['wed', Ext.Date.dayNames[2]],
	    ['thu', Ext.Date.dayNames[3]],
	    ['fri', Ext.Date.dayNames[4]],
	    ['sat', Ext.Date.dayNames[5]],
	    ['sun', Ext.Date.dayNames[6]]
	];

	me.callParent();
    }
});
