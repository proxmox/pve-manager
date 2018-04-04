/*jslint confusion: true*/
Ext.define('PVE.ClusterCreateWindow', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveClusterCreateWindow',

    title: gettext('Create Cluster'),
    width: 600,

    method: 'POST',
    url: '/cluster/config',

    isCreate: true,
    subject: gettext('Cluster'),
    showTaskViewer: true,

    items: [
	{
	    xtype: 'textfield',
	    fieldLabel: gettext('Cluster Name'),
	    allowBlank: false,
	    name: 'clustername'
	},
	{
	    xtype: 'proxmoxtextfield',
	    fieldLabel: gettext('Ring 0 Address'),
	    emptyText: gettext("Optional, defaults to IP resolved by node's hostname"),
	    name: 'ring0_addr',
	    skipEmptyText: true
	}
	// TODO: for advanced options: ring1_addr
    ]
});
