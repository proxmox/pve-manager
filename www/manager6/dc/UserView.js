Ext.define('PVE.dc.UserView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveUserView'],

    onlineHelp: 'pveum_users',

    stateful: true,
    stateId: 'grid-users',

    initComponent: function() {
	var me = this;

	var caps = Ext.state.Manager.get('GuiCap');

	var store = new Ext.data.Store({
            id: "users",
	    model: 'pve-users',
	    sorters: {
		property: 'userid',
		order: 'DESC',
	    },
	});
	let reload = () => store.load();

	let sm = Ext.create('Ext.selection.RowModel', {});

	let remove_btn = Ext.create('Proxmox.button.StdRemoveButton', {
	    selModel: sm,
	    baseurl: '/access/users/',
	    dangerous: true,
	    enableFn: rec => caps.access['User.Modify'] && rec.data.userid !== 'root@pam',
	    callback: () => reload(),
	});
	let run_editor = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec || !caps.access['User.Modify']) {
		return;
	    }
	    Ext.create('PVE.dc.UserEdit', {
		userid: rec.data.userid,
		autoShow: true,
		listeners: {
		    destroy: () => reload(),
		},
	    });
	};
	let edit_btn = new Proxmox.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    enableFn: function(rec) {
		return !!caps.access['User.Modify'];
	    },
	    selModel: sm,
	    handler: run_editor,
	});
	let pwchange_btn = new Proxmox.button.Button({
	    text: gettext('Password'),
	    disabled: true,
	    selModel: sm,
	    enableFn: function(record) {
		let type = record.data['realm-type'];
		if (type) {
		    if (PVE.Utils.authSchema[type]) {
			return !!PVE.Utils.authSchema[type].pwchange;
		    }
		}
		return false;
	    },
	    handler: function(btn, event, rec) {
		Ext.create('Proxmox.window.PasswordEdit', {
		    userid: rec.data.userid,
		    autoShow: true,
		    listeners: {
			destroy: () => reload(),
		    },
		});
	    },
	});
	let tfachange_btn = new Proxmox.button.Button({
	    text: 'TFA',
	    disabled: true,
	    selModel: sm,
	    enableFn: function(record) {
		let type = record.data['realm-type'];
		if (type) {
		    if (PVE.Utils.authSchema[type]) {
			return !!PVE.Utils.authSchema[type].tfa;
		    }
		}
		return false;
	    },
	    handler: function(btn, event, rec) {
		var d = rec.data;
		var tfa_type = PVE.Parser.parseTfaType(d.keys);
		Ext.create('PVE.window.TFAEdit', {
		    tfa_type: tfa_type,
		    userid: d.userid,
		    autoShow: true,
		    listeners: {
			destroy: () => reload(),
		    },
		});
	    },
	});

	var perm_btn = new Proxmox.button.Button({
	    text: gettext('Permissions'),
	    disabled: true,
	    selModel: sm,
	    handler: function(btn, event, rec) {
		Ext.create('PVE.dc.PermissionView', {
		    userid: rec.data.userid,
		    autoShow: true,
		    listeners: {
			destroy: () => reload(),
		    },
		});
	    },
	});

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: [
		{
		    text: gettext('Add'),
		    disabled: !caps.access['User.Modify'],
		    handler: function() {
			Ext.create('PVE.dc.UserEdit', {
			    autoShow: true,
			    listeners: {
				destroy: () => reload(),
			    },
			});
		    },
		},
		'-',
		edit_btn,
		remove_btn,
		'-',
		pwchange_btn,
		tfachange_btn,
		'-',
		perm_btn,
	    ],
	    viewConfig: {
		trackOver: false,
	    },
	    columns: [
		{
		    header: gettext('User name'),
		    width: 200,
		    sortable: true,
		    renderer: Proxmox.Utils.render_username,
		    dataIndex: 'userid',
		},
		{
		    header: gettext('Realm'),
		    width: 100,
		    sortable: true,
		    renderer: Proxmox.Utils.render_realm,
		    dataIndex: 'userid',
		},
		{
		    header: gettext('Enabled'),
		    width: 80,
		    sortable: true,
		    renderer: Proxmox.Utils.format_boolean,
		    dataIndex: 'enable',
		},
		{
		    header: gettext('Expire'),
		    width: 80,
		    sortable: true,
		    renderer: Proxmox.Utils.format_expire,
		    dataIndex: 'expire',
		},
		{
		    header: gettext('Name'),
		    width: 150,
		    sortable: true,
		    renderer: PVE.Utils.render_full_name,
		    dataIndex: 'firstname',
		},
		{
		    header: 'TFA',
		    width: 50,
		    sortable: true,
		    renderer: function(v) {
			let tfa_type = PVE.Parser.parseTfaType(v);
			if (tfa_type === undefined) {
			    return Proxmox.Utils.noText;
			} else if (tfa_type === 1) {
			    return Proxmox.Utils.yesText;
			} else {
			    return tfa_type;
			}
		    },
		    dataIndex: 'keys',
		},
		{
		    header: gettext('Comment'),
		    sortable: false,
		    renderer: Ext.String.htmlEncode,
		    dataIndex: 'comment',
		    flex: 1,
		},
	    ],
	    listeners: {
		activate: reload,
		itemdblclick: run_editor,
	    },
	});

	me.callParent();

	Proxmox.Utils.monStoreErrors(me, store);
    },
});
