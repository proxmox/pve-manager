Ext.define('PVE.panel.NotesView', {
    extend: 'Ext.panel.Panel',
    xtype: 'pveNotesView',

    title: gettext("Notes"),
    bodyPadding: 10,
    scrollable: true,
    animCollapse: false,
    maxLength: 64 * 1024,

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
	}).setMaxLength(me.maxLength);
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

		let mdHTML = Proxmox.Markdown.parse(data);
		me.update(mdHTML);

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
	const me = this;
	const type = me.pveSelNode.data.type;

	if (me.pveSelNode.data.id === 'root') {
	    me.url = '/api2/extjs/cluster/options';
	} else {
	    const nodename = me.pveSelNode.data.node;
	    if (!nodename) {
		throw "no node name specified";
	    }

	    if (!Ext.Array.contains(['node', 'qemu', 'lxc'], type)) {
		throw 'invalid type specified';
	    }

	    const vmid = me.pveSelNode.data.vmid;
	    if (!vmid && type !== 'node') {
		throw "no VM ID specified";
	    }

	    me.url = `/api2/extjs/nodes/${nodename}/`;

	    // add the type specific path if qemu/lxc and set the backend's maxLen
	    if (type === 'qemu' || type === 'lxc') {
		me.url += `${type}/${vmid}/`;
		me.maxLength = 8 * 1024;
	    }
	    me.url += 'config';
	}

	me.callParent();
	if (type === 'node' || type === '') { // '' is for datacenter
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
