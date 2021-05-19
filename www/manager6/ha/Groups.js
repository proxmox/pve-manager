Ext.define('PVE.ha.GroupsView', {
    extend: 'Ext.grid.GridPanel',
    alias: ['widget.pveHAGroupsView'],

    onlineHelp: 'ha_manager_groups',

    stateful: true,
    stateId: 'grid-ha-groups',

    initComponent: function() {
	var me = this;

	var caps = Ext.state.Manager.get('GuiCap');

	var store = new Ext.data.Store({
	    model: 'pve-ha-groups',
	    sorters: {
		property: 'group',
		order: 'DESC',
	    },
	});

	var reload = function() {
	    store.load();
	};

	var sm = Ext.create('Ext.selection.RowModel', {});

	let run_editor = function() {
	    let rec = sm.getSelection()[0];
            Ext.create('PVE.ha.GroupEdit', {
                groupId: rec.data.group,
		listeners: {
		    destroy: () => store.load(),
		},
		autoShow: true,
            });
	};

	let remove_btn = Ext.create('Proxmox.button.StdRemoveButton', {
	    selModel: sm,
	    baseurl: '/cluster/ha/groups/',
	    callback: () => store.load(),
	});
	let edit_btn = new Proxmox.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    selModel: sm,
	    handler: run_editor,
	});

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    viewConfig: {
		trackOver: false,
	    },
	    tbar: [
		{
		    text: gettext('Create'),
		    disabled: !caps.nodes['Sys.Console'],
		    handler: function() {
			Ext.create('PVE.ha.GroupEdit', {
			    listeners: {
				destroy: () => store.load(),
			    },
			    autoShow: true,
			});
		    },
		},
		edit_btn,
		remove_btn,
	    ],
	    columns: [
		{
		    header: gettext('Group'),
		    width: 150,
		    sortable: true,
		    dataIndex: 'group',
		},
		{
		    header: 'restricted',
		    width: 100,
		    sortable: true,
		    renderer: Proxmox.Utils.format_boolean,
		    dataIndex: 'restricted',
		},
		{
		    header: 'nofailback',
		    width: 100,
		    sortable: true,
		    renderer: Proxmox.Utils.format_boolean,
		    dataIndex: 'nofailback',
		},
		{
		    header: gettext('Nodes'),
		    flex: 1,
		    sortable: false,
		    dataIndex: 'nodes',
		},
		{
		    header: gettext('Comment'),
		    flex: 1,
		    renderer: Ext.String.htmlEncode,
		    dataIndex: 'comment',
		},
	    ],
	    listeners: {
		activate: reload,
		beforeselect: (grid, record, index, eOpts) => caps.nodes['Sys.Console'],
		itemdblclick: run_editor,
	    },
	});

	me.callParent();
    },
});
