Ext.define('PVE.window.NotesEdit', {
    extend: 'Proxmox.window.Edit',

    title: gettext('Notes'),
    onlineHelp: 'markdown_basics',

    width: 800,
    height: '600px',

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
	emptyText: gettext('You can use Markdown for rich text formatting.'),
	fieldStyle: {
	    'white-space': 'pre-wrap',
	    'font-family': 'monospace',
	},
    },
});
