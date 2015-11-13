Ext.define('PVE.form.DayOfWeekSelector', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.pveDayOfWeekSelector'],
    comboItems: [
	    ['sun', Ext.util.Format.htmlDecode(Ext.Date.dayNames[0])],
	    ['mon', Ext.util.Format.htmlDecode(Ext.Date.dayNames[1])],
	    ['tue', Ext.util.Format.htmlDecode(Ext.Date.dayNames[2])],
	    ['wed', Ext.util.Format.htmlDecode(Ext.Date.dayNames[3])],
	    ['thu', Ext.util.Format.htmlDecode(Ext.Date.dayNames[4])],
	    ['fri', Ext.util.Format.htmlDecode(Ext.Date.dayNames[5])],
	    ['sat', Ext.util.Format.htmlDecode(Ext.Date.dayNames[6])]
	]
});
