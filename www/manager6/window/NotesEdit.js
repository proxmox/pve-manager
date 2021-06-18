Ext.define('PVE.window.NotesEdit', {
    extend: 'Proxmox.window.Edit',

    title: gettext('Notes'),

    width: 600,
    height: '400px',
    resizable: true,
    layout: 'fit',

    autoLoad: true,
    defaultButton: undefined,

    setMaxLength: function(maxLength) {
	let me = this;

	let area = me.down('textarea[name="description"]');
	area.maxLength = maxLength;
	area.validate();

	return me;
    },

    items: {
	xtype: 'textarea',
	name: 'description',
	height: '100%',
	value: '',
	hideLabel: true,
    },
});
