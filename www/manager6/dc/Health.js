Ext.define('PVE.dc.Health', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveDcHealth',

    title: gettext('Health'),

    bodyPadding: '0 20 0 20',
    height: 200,
    layout: {
	type: 'hbox',
	align: 'stretch'
    },

    defaults: {
	flex: 1,
	xtype: 'box',
	style: {
	    'text-align':'center'
	}
    },

    cepherrors: 0,

    updateStatus: function(store, records, success) {
	var me = this;
	if (!success) {
	    return;
	}

	var cluster = {
	    iconCls: PVE.Utils.get_health_icon('good', true),
	    text: gettext("Standalone node - no cluster defined")
	};

	var nodes = {
	    online: 0,
	    offline: 0
	};

	// by default we have one node
	var numNodes = 1;
	var i;

	for (i = 0; i < records.length; i++) {
	    var item = records[i];
	    if (item.data.type === 'node') {
		nodes[item.data.online === 1 ? 'online':'offline']++;
	    } else if(item.data.type === 'cluster') {
		cluster.text = gettext("Cluster") + ": ";
		cluster.text += item.data.name + ", ";
		cluster.text += gettext("Quorate") + ": ";
		cluster.text += PVE.Utils.format_boolean(item.data.quorate);
		if (item.data.quorate != 1) {
		    cluster.iconCls = PVE.Utils.get_health_icon('critical', true);
		}

		numNodes = item.data.nodes;
	    }
	}

	if (numNodes !== (nodes.online + nodes.offline)) {
	    nodes.offline = numNodes - nodes.online;
	}

	me.getComponent('clusterstatus').updateHealth(cluster);
	me.getComponent('nodestatus').update(nodes);
    },

    updateCeph: function(store, records, success) {
	var me = this;
	var cephstatus = me.getComponent('ceph');
	if (!success || records.length < 1) {

	    // if ceph status is already visible
	    // dont stop to update
	    if (cephstatus.isVisible()) {
		return;
	    }
	    me.cepherrors++;

	    // after 3 unsuccessful tries of
	    // /nodes/localhost/ceph/status
	    // we give up (there probably is no ceph installed)
	    if (me.cepherrors >= 3) {
		me.cephstore.stopUpdate();
	    }
	    return;
	}

	me.cepherrors = 0;

	var state = PVE.Utils.render_ceph_health(records[0].data.health || {});
	cephstatus.updateHealth(state);
	cephstatus.setVisible(true);
    },

    listeners: {
	destroy: function() {
	    var me = this;
	    me.cephstore.stopUpdate();
	}
    },

    items: [
	{
	    itemId: 'clusterstatus',
	    xtype: 'pveHealthWidget',
	    title: gettext('Status')
	},
	{
	    itemId: 'nodestatus',
	    data: {
		online: 0,
		offline: 0
	    },
	    tpl: [
		'<h3>' + gettext('Nodes') + '</h3><br />',
		'<div style="width: 150px;margin: auto;font-size: 12pt">',
		'<div class="left-aligned">',
		'<i class="good fa fa-fw fa-check">&nbsp;</i>',
		gettext('Online'),
		'</div>',
		'<div class="right-aligned">{online}</div>',
		'<br /><br />',
		'<div class="left-aligned">',
		'<i class="critical fa fa-fw fa-times">&nbsp;</i>',
		gettext('Offline'),
		'</div>',
		'<div class="right-aligned">{offline}</div>',
		'</div>'
	    ]
	},
	{
	    itemId: 'ceph',
	    width: 250,
	    columnWidth: undefined,
	    userCls: 'pointer',
	    title: 'Ceph',
	    xtype: 'pveHealthWidget',
	    hidden: true,
	    listeners: {
		element: 'el',
		click: function() {
		    var me = this;
		    var sp = Ext.state.Manager.getProvider();

		    // preselect the ceph tab
		    sp.set('nodetab', {value:'ceph'});

		    // select the first node which is online
		    var nodeid = '';
		    var nodes = PVE.data.ResourceStore.getNodes();
		    Ext.Array.some(nodes, function(node) {
			if (node.running) {
			    nodeid = node.id;
			    return true;
			}

			return false;
		    });
		    Ext.ComponentQuery.query('pveResourceTree')[0].selectById(nodeid);
		}
	    }
	}
    ],

    initComponent: function() {
	var me = this;

	me.cephstore = Ext.create('PVE.data.UpdateStore', {
	    interval: 3000,
	    storeid: 'pve-cluster-ceph',
	    proxy: {
		type: 'pve',
		url: '/api2/json/nodes/localhost/ceph/status'
	    }
	});
	me.callParent();
	me.cephstore.startUpdate();
	me.mon(me.cephstore, 'load', me.updateCeph, me);
    }
});
