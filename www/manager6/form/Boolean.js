// boolean type including 'Default' (delete property from file)
Ext.define('PVE.form.Boolean', {
    extend: 'PVE.form.KVComboBox',
    alias: ['widget.booleanfield'],
    comboItems: [
	['__default__', gettext('Default')],
	[1, gettext('Yes')],
	[0, gettext('No')]
    ]
});
