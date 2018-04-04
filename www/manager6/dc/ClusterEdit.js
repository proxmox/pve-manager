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

Ext.define('PVE.ClusterInfoWindow', {
    extend: 'Ext.window.Window',
    xtype: 'pveClusterInfoWindow',
    mixins: ['Proxmox.Mixin.CBind'],

    width: 800,
    modal: true,
    resizable: false,
    title: gettext('Cluster Join Information'),

    joinInfo: {
	ipAddress: undefined,
	fingerprint: undefined,
	totem: {}
    },

    items: [
	{
	    xtype: 'component',
	    border: false,
	    padding: '10 10 10 10',
	    html: gettext("Copy the Join Information here and use it on the node you want to add.")
	},
	{
	    xtype: 'container',
	    layout: 'form',
	    border: false,
	    padding: '0 10 10 10',
	    items: [
		{
		    xtype: 'textfield',
		    fieldLabel: gettext('IP Address'),
		    cbind: { value: '{joinInfo.ipAddress}' },
		    editable: false
		},
		{
		    xtype: 'textfield',
		    fieldLabel: gettext('Fingerprint'),
		    cbind: { value: '{joinInfo.fingerprint}' },
		    editable: false
		},
		{
		    xtype: 'textarea',
		    inputId: 'pveSerializedClusterInfo',
		    fieldLabel: gettext('Join Information'),
		    grow: true,
		    cbind: { joinInfo: '{joinInfo}' },
		    editable: false,
		    listeners: {
			afterrender: function(field) {
			    if (!field.joinInfo) {
				return;
			    }
			    var jsons = Ext.JSON.encode(field.joinInfo);
			    var base64s = Ext.util.Base64.encode(jsons);
			    field.setValue(base64s);
			}
		    }
		}
	    ]
	}
    ],
    dockedItems: [{
	dock: 'bottom',
	xtype: 'toolbar',
	items: [{
	    xtype: 'button',
	    handler: function(b) {
		var el = document.getElementById('pveSerializedClusterInfo');
		el.select();
		document.execCommand("copy");
	    },
	    text: gettext('Copy Information')
	}]
    }]
});
