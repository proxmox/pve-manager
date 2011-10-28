Ext.define('PVE.form.DayOfWeekSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveDayOfWeekSelector'],
  
    initComponent: function() {
	var me = this;

	me.data = [
	    ['mon', 'Monday'],
	    ['tue', 'Tuesday'],
	    ['wed', 'Wednesday'],
	    ['thu', 'Thursday'],
	    ['fri', 'Friday'],
	    ['sat', 'Saturday'],
	    ['sun', 'Sunday']
	];

	me.callParent();
    }
});
