Ext.define('PVE.form.CalendarEvent', {
    extend: 'Ext.form.field.ComboBox',
    xtype: 'pveCalendarEvent',

    editable: true,

    valueField: 'value',
    displayField: 'text',
    queryMode: 'local',

    store: {
	field: [ 'value', 'text'],
	data: [
	    { value: '*/30', text: Ext.String.format(gettext("Every {0} minutes"), 30) },
	    { value: '*/2:00', text: gettext("Every two hours")},
	    { value: '2,22:30', text: gettext("Every day") + " 02:30, 22:30"},
	    { value: 'mon..fri', text: gettext("Monday to Friday") + " 00:00"},
	    { value: 'mon..fri */1:00', text: gettext("Monday to Friday") + ': ' +  gettext("hourly")},
	    { value: 'sun 01:00', text: gettext("Sunday") + " 01:00"}
	]
    },

    tpl: [
	'<ul class="x-list-plain"><tpl for=".">',
	    '<li role="option" class="x-boundlist-item">{text}</li>',
	'</tpl></ul>'
    ],

    displayTpl: [
	'<tpl for=".">',
	'{value}',
	'</tpl>'
    ]

});
