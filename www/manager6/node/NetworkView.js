Ext.define('PVE.node.NetworkView', {
    extend: 'Ext.panel.Panel',

    alias: ['widget.pveNodeNetworkView'],

    onlineHelp: 'sysadmin_network_configuration',

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var store = Ext.create('Ext.data.Store', {
	    model: 'pve-networks',
	    proxy: {
                type: 'pve',
                url: "/api2/json/nodes/" + nodename + "/network"
	    },
	    sorters: [
		{
		    property : 'iface',
		    direction: 'ASC'
		}
	    ]
	});

	var reload = function() {
	    var changeitem = me.down('#changes');
	    PVE.Utils.API2Request({
		url: '/nodes/' + nodename + '/network',
		failure: function(response, opts) {
		    changeitem.update(gettext('Error') + ': ' + response.htmlStatus);
		    store.loadData({});
		},
		success: function(response, opts) {
		    var result = Ext.decode(response.responseText);
		    store.loadData(result.data);
		    var changes = result.changes;
		    if (changes === undefined || changes === '') {
			changes = gettext("No changes");
		    }
		    changeitem.update("<pre>" + Ext.htmlEncode(changes) + "</pre>");
		}
	    });
	};

	var run_editor = function() {
	    var grid = me.down('gridpanel');
	    var sm = grid.getSelectionModel();
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    var win = Ext.create('PVE.node.NetworkEdit', {
		pveSelNode: me.pveSelNode,
		iface: rec.data.iface,
		iftype: rec.data.type
	    });
	    win.show();
	    win.on('destroy', reload);
	};

	var edit_btn = new Ext.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    handler: run_editor
	});

	var del_btn = new Ext.Button({
	    text: gettext('Remove'),
	    disabled: true,
	    handler: function(){
		var grid = me.down('gridpanel');
		var sm = grid.getSelectionModel();
		var rec = sm.getSelection()[0];
		if (!rec) {
		    return;
		}

		var iface = rec.data.iface;

		PVE.Utils.API2Request({
		    url: '/nodes/' + nodename + '/network/' + iface,
		    method: 'DELETE',
		    waitMsgTarget: me,
		    callback: function() {
			reload();
		    },
		    failure: function(response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    }
		});
	    }
	});

	var set_button_status = function() {
	    var grid = me.down('gridpanel');
	    var sm = grid.getSelectionModel();
	    var rec = sm.getSelection()[0];

	    edit_btn.setDisabled(!rec);
	    del_btn.setDisabled(!rec);
	};

	PVE.Utils.monStoreErrors(me, store);

	var render_ports = function(value, metaData, record) {
	    if (value === 'bridge') {
		return record.data.bridge_ports;
	    } else if (value === 'bond') {
		return record.data.slaves;
	    } else if (value === 'OVSBridge') {
		return record.data.ovs_ports;
	    } else if (value === 'OVSBond') {
		return record.data.ovs_bonds;
	    }
	};

	var find_next_iface_id = function(prefix) {
	    var next;
	    for (next = 0; next <= 9999; next++) {
		if (!store.getById(prefix + next.toString())) {
		    break;
		}
	    }
	    return prefix + next.toString();
	};

	Ext.apply(me, {
	    layout: 'border',
	    tbar: [
		{
		    text: gettext('Create'),
		    menu: new Ext.menu.Menu({
			plain: true,
			items: [
			    {
				text: PVE.Utils.render_network_iface_type('bridge'),
				handler: function() {
				    var win = Ext.create('PVE.node.NetworkEdit', {
					pveSelNode: me.pveSelNode,
					iftype: 'bridge',
					iface_default: find_next_iface_id('vmbr')
				    });
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: PVE.Utils.render_network_iface_type('bond'),
				handler: function() {
				    var win = Ext.create('PVE.node.NetworkEdit', {
					pveSelNode: me.pveSelNode,
					iftype: 'bond',
					iface_default: find_next_iface_id('bond')
				    });
				    win.on('destroy', reload);
				    win.show();
				}
			    }, '-',
			    {
				text: PVE.Utils.render_network_iface_type('OVSBridge'),
				handler: function() {
				    var win = Ext.create('PVE.node.NetworkEdit', {
					pveSelNode: me.pveSelNode,
					iftype: 'OVSBridge',
					iface_default: find_next_iface_id('vmbr')
				    });
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: PVE.Utils.render_network_iface_type('OVSBond'),
				handler: function() {
				    var win = Ext.create('PVE.node.NetworkEdit', {
					pveSelNode: me.pveSelNode,
					iftype: 'OVSBond',
					iface_default: find_next_iface_id('bond')
				    });
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: PVE.Utils.render_network_iface_type('OVSIntPort'),
				handler: function() {
				    var win = Ext.create('PVE.node.NetworkEdit', {
					pveSelNode: me.pveSelNode,
					iftype: 'OVSIntPort'
				    });
				    win.on('destroy', reload);
				    win.show();
				}
			    }
			]
		    })
		}, ' ', 
		{
		    text: gettext('Revert'),
		    handler: function() {
			PVE.Utils.API2Request({
			    url: '/nodes/' + nodename + '/network',
			    method: 'DELETE',
			    waitMsgTarget: me,
			    callback: function() {
				reload();
			    },
			    failure: function(response, opts) {
				Ext.Msg.alert(gettext('Error'), response.htmlStatus);
			    }
			});
		    }
		},
		edit_btn, 
		del_btn
	    ],
	    items: [
		{
		    xtype: 'gridpanel',
		    stateful: true,
		    stateId: 'grid-node-network',
		    store: store,
		    region: 'center',
		    border: false,
		    columns: [
			{
			    header: gettext('Name'),
			    width: 100,
			    sortable: true,
			    dataIndex: 'iface'
			},
			{
			    header: gettext('Type'),
			    width: 100,
			    sortable: true,
			    renderer: PVE.Utils.render_network_iface_type,
			    dataIndex: 'type'
			},
			{
			    xtype: 'booleancolumn', 
			    header: gettext('Active'),
			    width: 80,
			    sortable: true,
			    dataIndex: 'active',
			    trueText: 'Yes',
			    falseText: 'No',
			    undefinedText: 'No'
			},
			{
			    xtype: 'booleancolumn', 
			    header: gettext('Autostart'),
			    width: 80,
			    sortable: true,
			    dataIndex: 'autostart',
			    trueText: 'Yes',
			    falseText: 'No',
			    undefinedText: 'No'
			},
			{
			    header: gettext('Ports/Slaves'),
			    dataIndex: 'type',
			    renderer: render_ports
			},
			{
			    header: gettext('IP address'),
			    sortable: true,
			    dataIndex: 'address',
			    renderer: function(value, metaData, rec) {
				if (rec.data.address && rec.data.address6) {
				    return rec.data.address + "<br>"
				           + rec.data.address6 + '/' + rec.data.netmask6;
				} else if (rec.data.address6) {
				    return rec.data.address6 + '/' + rec.data.netmask6;
				} else {
				    return rec.data.address;
				}
			    }
			},
			{
			    header: gettext('Subnet mask'),
			    sortable: true,
			    dataIndex: 'netmask'
			},
			{
			    header: gettext('Gateway'),
			    sortable: true,
			    dataIndex: 'gateway',
			    renderer: function(value, metaData, rec) {
				if (rec.data.gateway && rec.data.gateway6) {
				    return rec.data.gateway + "<br>" + rec.data.gateway6;
				} else if (rec.data.gateway6) {
				    return rec.data.gateway6;
				} else {
				    return rec.data.gateway;
				}
			    }
			},
			{
			    header: gettext('Comment'),
			    dataIndex: 'comments',
			    renderer: Ext.String.htmlEncode
			}
		    ],
		    listeners: {
			selectionchange: set_button_status,
			itemdblclick: run_editor
		    }
		},
		{
		    border: false,
		    region: 'south',
		    autoScroll: true,
		    itemId: 'changes',
		    tbar: [ 
			gettext('Pending changes') + ' (' +
			    gettext('Please reboot to activate changes') + ')'
		    ],
		    split: true, 
		    bodyPadding: 5,
		    flex: 0.6,
		    html: gettext("No changes")
		}
	    ],
	    listeners: {
		activate: reload
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('pve-networks', {
	extend: 'Ext.data.Model',
	fields: [ 
	    'iface', 'type', 'active', 'autostart',
	    'bridge_ports', 'slaves',
	    'address', 'netmask', 'gateway',
	    'address6', 'netmask6', 'gateway6',
	    'comments'
	],
	idProperty: 'iface'
    });

});
    
