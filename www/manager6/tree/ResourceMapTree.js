Ext.define('PVE.tree.ResourceMapTree', {
    extend: 'Ext.tree.Panel',
    alias: 'widget.pveResourceMapTree',
    mixins: ['Proxmox.Mixin.CBind'],

    rootVisible: false,

    emptyText: gettext('No Mapping found'),

    // will be opened on edit
    editWindowClass: undefined,

    // The base url of the resource
    baseUrl: undefined,

    // icon class to show on the entries
    mapIconCls: undefined,

    // if given, should be a function that takes a nodename and returns
    // the url for getting the data to check the status
    getStatusCheckUrl: undefined,

    // the result of above api call and the nodename is passed and can set the status
    checkValidity: undefined,

    // the property that denotes a single map entry for a node
    entryIdProperty: undefined,

    cbindData: function(initialConfig) {
	let me = this;
	const caps = Ext.state.Manager.get('GuiCap');
	me.canConfigure = !!caps.mapping['Mapping.Modify'];

	return {};
    },

    controller: {
	xclass: 'Ext.app.ViewController',

	addMapping: function() {
	    let me = this;
	    let view = me.getView();
	    Ext.create(view.editWindowClass, {
		url: view.baseUrl,
		autoShow: true,
		listeners: {
		    destroy: () => me.load(),
		},
	    });
	},

	addHost: function() {
	    let me = this;
	    me.edit(false);
	},

	edit: function(includeNodename = true) {
	    let me = this;
	    let view = me.getView();
	    let selection = view.getSelection();
	    if (!selection || !selection.length) {
		return;
	    }
	    let rec = selection[0];
	    if (!view.canConfigure || (rec.data.type === 'entry' && includeNodename)) {
		return;
	    }

	    Ext.create(view.editWindowClass, {
		url: `${view.baseUrl}/${rec.data.name}`,
		autoShow: true,
		autoLoad: true,
		nodename: includeNodename ? rec.data.node : undefined,
		name: rec.data.name,
		listeners: {
		    destroy: () => me.load(),
		},
	    });
	},

	remove: function() {
	    let me = this;
	    let view = me.getView();
	    let selection = view.getSelection();
	    if (!selection || !selection.length) {
		return;
	    }

	    let data = selection[0].data;
	    let url = `${view.baseUrl}/${data.name}`;
	    let method = 'PUT';
	    let params = {
		digest: me.lookup[data.name].digest,
	    };
	    let map = me.lookup[data.name].map;
	    switch (data.type) {
		case 'entry':
		    method = 'DELETE';
		    params = undefined;
		    break;
		case 'node':
		    params.map = PVE.Parser.filterPropertyStringList(map, (e) => e.node !== data.node);
		    break;
		case 'map':
		    params.map = PVE.Parser.filterPropertyStringList(map, (e) =>
			Object.entries(e).some(([key, value]) => data[key] !== value));
		    break;
		default:
		    throw "invalid type";
	    }
	    if (!params?.map.length) {
		method = 'DELETE';
		params = undefined;
	    }
	    Proxmox.Utils.API2Request({
		url,
		method,
		params,
		success: function() {
		    me.load();
		},
	    });
	},

	load: function() {
	    let me = this;
	    let view = me.getView();
	    Proxmox.Utils.API2Request({
		url: view.baseUrl,
		method: 'GET',
		failure: response => Ext.Msg.alert(gettext('Error'), response.htmlStatus),
		success: function({ result: { data } }) {
		    let lookup = {};
		    data.forEach((entry) => {
			lookup[entry.id] = Ext.apply({}, entry);
			entry.iconCls = 'fa fa-fw fa-folder-o';
			entry.name = entry.id;
			entry.text = entry.id;
			entry.type = 'entry';

			let nodes = {};
			for (const map of entry.map) {
			    let parsed = PVE.Parser.parsePropertyString(map);
			    parsed.iconCls = view.mapIconCls;
			    parsed.leaf = true;
			    parsed.name = entry.id;
			    parsed.text = parsed[view.entryIdProperty];
			    parsed.type = 'map';

			    if (nodes[parsed.node] === undefined) {
				nodes[parsed.node] = {
				    children: [],
				    expanded: true,
				    iconCls: 'fa fa-fw fa-building-o',
				    leaf: false,
				    name: entry.id,
				    node: parsed.node,
				    text: parsed.node,
				    type: 'node',
				};
			    }
			    nodes[parsed.node].children.push(parsed);
			}
			delete entry.id;
			entry.children = Object.values(nodes);
			entry.leaf = entry.children.length === 0;
		    });
		    me.lookup = lookup;
		    if (view.getStatusCheckUrl !== undefined && view.checkValidity !== undefined) {
			me.loadStatusData();
		    }
		    view.setRootNode({
			children: data,
		    });
		    let root = view.getRootNode();
		    root.expand();
		    root.childNodes.forEach(node => node.expand());
		},
	    });
	},

	nodeLoadingState: {},

	loadStatusData: function() {
	    let me = this;
	    let view = me.getView();
	    PVE.data.ResourceStore.getNodes().forEach(({ node }) => {
		me.nodeLoadingState[node] = true;
		let url = view.getStatusCheckUrl(node);
		Proxmox.Utils.API2Request({
		    url,
		    method: 'GET',
		    failure: function(response) {
			me.nodeLoadingState[node] = false;
			view.getRootNode()?.cascade(function(rec) {
			    if (rec.data.node !== node) {
				return;
			    }

			    rec.set('valid', 0);
			    rec.set('errmsg', response.htmlStatus);
			    rec.commit();
			});
		    },
		    success: function({ result: { data } }) {
			me.nodeLoadingState[node] = false;
			view.checkValidity(data, node);
		    },
		});
	    });
	},

	renderStatus: function(value, _metadata, record) {
	    let me = this;
	    if (record.data.type !== 'map') {
		return '';
	    }
	    let iconCls;
	    let status;
	    if (value === undefined) {
		if (me.nodeLoadingState[record.data.node]) {
		    iconCls = 'fa-spinner fa-spin';
		    status = gettext('Loading...');
		} else {
		    iconCls = 'fa-question-circle';
		    status = gettext('Unknown Node');
		}
	    } else {
		let state = value ? 'good' : 'critical';
		iconCls = PVE.Utils.get_health_icon(state, true);
		status = value ? gettext("Mapping matches host data") : record.data.errmsg || Proxmox.Utils.unknownText;
	    }
	    return `<i class="fa ${iconCls}"></i> ${status}`;
	},

	init: function(view) {
	    let me = this;

	    ['editWindowClass', 'baseUrl', 'mapIconCls', 'entryIdProperty'].forEach((property) => {
		if (view[property] === undefined) {
		    throw `No ${property} defined`;
		}
	    });

	    me.load();
	},
    },

    store: {
	sorters: 'text',
	data: {},
    },


    tbar: [
	{
	    text: gettext('Add mapping'),
	    handler: 'addMapping',
	    cbind: {
		disabled: '{!canConfigure}',
	    },
	},
	{
	    xtype: 'proxmoxButton',
	    text: gettext('New Host mapping'),
	    disabled: true,
	    parentXType: 'treepanel',
	    enableFn: function(_rec) {
		return this.up('treepanel').canConfigure;
	    },
	    handler: 'addHost',
	},
	{
	    xtype: 'proxmoxButton',
	    text: gettext('Edit'),
	    disabled: true,
	    parentXType: 'treepanel',
	    enableFn: function(rec) {
		return rec && rec.data.type !== 'entry' && this.up('treepanel').canConfigure;
	    },
	    handler: 'edit',
	},
	{
	    xtype: 'proxmoxButton',
	    parentXType: 'treepanel',
	    handler: 'remove',
	    disabled: true,
	    text: gettext('Remove'),
	    enableFn: function(rec) {
		return rec && this.up('treepanel').canConfigure;
	    },
	    confirmMsg: function(rec) {
		let msg, id;
		let view = this.up('treepanel');
		switch (rec.data.type) {
		    case 'entry':
			msg = gettext("Are you sure you want to remove '{0}'");
			return Ext.String.format(msg, rec.data.name);
		    case 'node':
			msg = gettext("Are you sure you want to remove '{0}' entries for '{1}'");
			return Ext.String.format(msg, rec.data.node, rec.data.name);
		    case 'map':
			msg = gettext("Are you sure you want to remove '{0}' on '{1}' for '{2}'");
			id = rec.data[view.entryIdProperty];
			return Ext.String.format(msg, id, rec.data.node, rec.data.name);
		    default:
			throw "invalid type";
		}
	    },
	},
    ],

    listeners: {
	itemdblclick: 'edit',
    },
});
