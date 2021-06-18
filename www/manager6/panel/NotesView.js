Ext.define('PVE.panel.NotesView', {
    extend: 'Ext.panel.Panel',
    xtype: 'pveNotesView',

    title: gettext("Notes"),
    bodyStyle: 'white-space:pre',
    bodyPadding: 10,
    scrollable: true,
    animCollapse: false,

    tbar: {
	itemId: 'tbar',
	hidden: true,
	items: [
	    {
		text: gettext('Edit'),
		handler: function() {
		    let view = this.up('panel');
		    view.run_editor();
		},
	    },
	],
    },

    run_editor: function() {
	let me = this;
	Ext.create('PVE.window.NotesEdit', {
	    pveSelNode: me.pveSelNode,
	    url: me.url,
	    listeners: {
		destroy: () => me.load(),
	    },
	    autoShow: true,
	});
    },

    load: function() {
	var me = this;

	Proxmox.Utils.API2Request({
	    url: me.url,
	    waitMsgTarget: me,
	    failure: function(response, opts) {
		me.update(gettext('Error') + " " + response.htmlStatus);
		me.setCollapsed(false);
	    },
	    success: function(response, opts) {
		var data = response.result.data.description || '';
		me.update(Ext.htmlEncode(data));

		if (me.collapsible && me.collapseMode === 'auto') {
		    me.setCollapsed(data === '');
		}
	    },
	});
    },

    listeners: {
	render: function(c) {
	    var me = this;
	    me.getEl().on('dblclick', me.run_editor, me);
	},
	afterlayout: function() {
	    let me = this;
	    if (me.collapsible && !me.getCollapsed() && me.collapseMode === 'always') {
		me.setCollapsed(true);
		me.collapseMode = ''; // only once, on initial load!
	    }
	},
    },

    tools: [{
	type: 'gear',
	handler: function() {
	    let view = this.up('panel');
	    view.run_editor();
	},
    }],

    initComponent: function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	let type = me.pveSelNode.data.type;
	if (!Ext.Array.contains(['node', 'qemu', 'lxc'], type)) {
	    throw 'invalid type specified';
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid && type !== 'node') {
	    throw "no VM ID specified";
	}

	me.url = `/api2/extjs/nodes/${nodename}/`;

	// add the type specific path if qemu/lxc and set the backend's maxLen
	if (type === 'qemu' || type === 'lxc') {
	    me.url += `${type}/${vmid}/`;
	}

	me.url += 'config';

	me.callParent();
	if (type === 'node') {
	    me.down('#tbar').setVisible(true);
	} else if (me.pveSelNode.data.template !== 1) {
	    me.setCollapsible(true);
	    me.collapseDirection = 'right';

	    let sp = Ext.state.Manager.getProvider();
	    me.collapseMode = sp.get('guest-notes-collapse', 'never');

	    if (me.collapseMode === 'auto') {
		me.setCollapsed(true);
	    }
	}
	me.load();
    },
});
