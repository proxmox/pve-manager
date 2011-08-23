Ext.define('PVE.node.NetworkView', {
    extend: 'Ext.panel.Panel',

    alias: ['widget.pveNodeNetworkView'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var rstore = Ext.create('PVE.data.UpdateStore', {
	    interval: 1000,
	    storeid: 'pve-networks',
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

	var store = Ext.create('PVE.data.DiffStore', { rstore: rstore });

	var view_changes = function() {
	    var changeitem = me.down('#changes');
	    PVE.Utils.API2Request({
		url: '/nodes/' + nodename + '/network_changes',
		failure: function(response, opts) {
		    changeitem.update('Error: ' + response.htmlStatus);
		},
		success: function(response, opts) {
		    var result = Ext.decode(response.responseText);
		    var data = result.data;
		    if (data === '') {
			data = "no changes";
		    }
		    changeitem.update("<pre>" + Ext.htmlEncode(data) + "</pre>");
		}
	    });
	};

	var reload = function() {
	    rstore.load();
	    view_changes();
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
	    text: 'Edit',
	    disabled: true,
	    handler: run_editor
	});

	var del_btn = new Ext.Button({
	    text: 'Delete',
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
			Ext.Msg.alert('Error', response.htmlStatus);
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

	me.mon(rstore, 'load', function(s, records, success) {
	    if (!success) {
		me.setLoading("Data load error");
		return;
	    } else {
		me.setLoading(false);
	    }
	});

	var render_ports = function(value, metaData, record) {
	    if (value === 'bridge') {
		return record.data.bridge_ports;
	    } else if (value === 'bond') {
		return record.data.slaves;
	    }
	};

	Ext.apply(me, {
	    layout: 'border',
	    tbar: [
		{
		    text: 'Create',
		    menu: new Ext.menu.Menu({
			items: [
			    {
				text: 'Bridge',
				handler: function() {
				    var next;
				    for (next = 0; next <= 9999; next++) {
					if (!rstore.data.get('vmbr' + next.toString())) {
					    break;
					}
				    }
				    
				    var win = Ext.create('PVE.node.NetworkEdit', {
					pveSelNode: me.pveSelNode,
					iftype: 'bridge',
					iface_default: 'vmbr' + next.toString()
				    });
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: 'Bond',
				handler: function() {
				    var next;
				    for (next = 0; next <= 9999; next++) {
					if (!rstore.data.get('bond' + next.toString())) {
					    break;
					}
				    }
				    var win = Ext.create('PVE.node.NetworkEdit', {
					pveSelNode: me.pveSelNode,
					iftype: 'bond',
					iface_default: 'bond' + next.toString()
				    });
				    win.on('destroy', reload);
				    win.show();
				}
			    } 
			]
		    })
		}, ' ', 
		{
		    text: 'Revert changes',
		    handler: function() {
			PVE.Utils.API2Request({
			    url: '/nodes/' + nodename + '/network_changes',
			    method: 'DELETE',
			    waitMsgTarget: me,
			    callback: function() {
				reload();
			    },
			    failure: function(response, opts) {
				Ext.Msg.alert('Error', response.htmlStatus);
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
		    stateful: false,
		    store: store,
		    region: 'center',
		    border: false,
		    columns: [
			{
			    header: 'Interface Name',
			    width: 100,
			    sortable: true,
			    dataIndex: 'iface'
			},
			{
			    xtype: 'booleancolumn', 
			    header: 'Active',
			    width: 80,
			    sortable: true,
			    dataIndex: 'active',
			    trueText: 'Yes',
			    falseText: 'No',
			    undefinedText: 'No'
			},
			{
			    xtype: 'booleancolumn', 
			    header: 'Autostart',
			    width: 80,
			    sortable: true,
			    dataIndex: 'autostart',
			    trueText: 'Yes',
			    falseText: 'No',
			    undefinedText: 'No'
			},
			{
			    header: 'Ports/Slaves',
			    dataIndex: 'type',
			    renderer: render_ports
			},
			{
			    header: 'IP address',
			    sortable: true,
			    dataIndex: 'address'
			},
			{
			    header: 'Subnet mask',
			    sortable: true,
			    dataIndex: 'netmask'
			},
			{
			    header: 'Gateway',
			    sortable: true,
			    dataIndex: 'gateway'
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
			'Pending changes (please reboot to activate changes)'
		    ],
		    split: true, 
		    bodyPadding: 5,
		    flex: 0.6,
		    html: "no changes"
		}
	    ],
	    listeners: {
		show: reload
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('pve-networks', {
	extend: 'Ext.data.Model',
	fields: [ 
	    'iface', 'type', 'active', 'autostart',
	    'bridge_ports', 'slaves', 'address',
	    'netmask', 'gateway'
	],
	idProperty: 'iface'
    });

});
    