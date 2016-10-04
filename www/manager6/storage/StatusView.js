Ext.define('PVE.storage.StatusView', {
    extend: 'PVE.panel.StatusView',
    alias: 'widget.pveStorageStatusView',

    height: 230,
    title: gettext('Status'),

    defaults: {
	xtype: 'pveInfoWidget',
	padding: '0 30 5 30',
	width: 770
    },
    items: [
	{
	    xtype: 'box',
	    height: 30
	},
	{
	    itemId: 'enabled',
	    title: gettext('Enabled'),
	    printBar: false,
	    textField: 'disabled',
	    renderer: PVE.Utils.format_neg_boolean
	},
	{
	    itemId: 'active',
	    title: gettext('Active'),
	    printBar: false,
	    textField: 'active',
	    renderer: PVE.Utils.format_boolean
	},
	{
	    itemId: 'content',
	    title: gettext('Content'),
	    printBar: false,
	    textField: 'content',
	    renderer: PVE.Utils.format_content_types
	},
	{
	    itemId: 'type',
	    title: gettext('Type'),
	    printBar: false,
	    textField: 'type',
	    renderer: PVE.Utils.format_storage_type
	},
	{
	    xtype: 'box',
	    height: 10
	},
	{
	    itemId: 'usage',
	    title: gettext('Usage'),
	    valueField: 'used',
	    maxField: 'total'
	}
    ],

    updateTitle: function() {
	return;
    }
});
