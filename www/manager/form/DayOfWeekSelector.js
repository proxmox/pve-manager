Ext.define('PVE.form.DayOfWeekSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveDayOfWeekSelector'],
  
    initComponent: function() {
	var me = this;

	me.data = [
	    ['sun', Ext.Date.dayNames[0]],
	    ['mon', Ext.Date.dayNames[1]],
	    ['tue', Ext.Date.dayNames[2]],
	    ['wed', Ext.Date.dayNames[3]],
	    ['thu', Ext.Date.dayNames[4]],
	    ['fri', Ext.Date.dayNames[5]],
	    ['sat', Ext.Date.dayNames[6]]
	];

	me.callParent();
    }
});
