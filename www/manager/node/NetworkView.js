Ext.define('PVE.node.NetworkView', {
    extend: 'Ext.panel.Panel',

    alias: ['widget.pveNodeNetworkView'],

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
		    changeitem.update('Error: ' + response.htmlStatus);
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

	PVE.Utils.monStoreErrors(me, store);

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
		    text: gettext('Create'),
		    menu: new Ext.menu.Menu({
			items: [
			    {
				text: 'Bridge',
				handler: function() {
				    var next;
				    for (next = 0; next <= 9999; next++) {
					if (!store.data.get('vmbr' + next.toString())) {
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
					if (!store.data.get('bond' + next.toString())) {
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
		    text: gettext('Revert changes'),
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
		    stateful: false,
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
			    header: gettext('IP address'),
			    sortable: true,
			    dataIndex: 'address'
			},
			{
			    header: gettext('Subnet mask'),
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
    