Ext.define('PVE.dc.UserView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveUserView'],

    onlineHelp: 'pveum_users',

    stateful: true,
    stateId: 'grid-users',

    initComponent : function() {
	var me = this;

	var caps = Ext.state.Manager.get('GuiCap');

	var store = new Ext.data.Store({
            id: "users",
	    model: 'pve-users',
	    sorters: {
		property: 'userid',
		order: 'DESC'
	    }
	});

	var reload = function() {
	    store.load();
	};

	var sm = Ext.create('Ext.selection.RowModel', {});

	var remove_btn = Ext.create('Proxmox.button.StdRemoveButton', {
	    selModel: sm,
	    baseurl: '/access/users/',
	    enableFn: function(rec) {
		if (!caps.access['User.Modify']) {
		    return false;
		}
		return rec.data.userid !== 'root@pam';
	    },
	    callback: function() {
		reload();
	    }
        });

	var run_editor = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec || !caps.access['User.Modify']) {
		return;
	    }

            var win = Ext.create('PVE.dc.UserEdit',{
                userid: rec.data.userid
            });
            win.on('destroy', reload);
            win.show();
	};

	var edit_btn = new Proxmox.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    enableFn: function(rec) {
		return !!caps.access['User.Modify'];
	    },
	    selModel: sm,
	    handler: run_editor
	});

	var pwchange_btn = new Proxmox.button.Button({
	    text: gettext('Password'),
	    disabled: true,
	    selModel: sm,
	    handler: function(btn, event, rec) {
		var win = Ext.create('Proxmox.window.PasswordEdit', {
                    userid: rec.data.userid
		});
		win.on('destroy', reload);
		win.show();
	    }
	});

	var tfachange_btn = new Proxmox.button.Button({
	    text: 'TFA',
	    disabled: true,
	    selModel: sm,
	    handler: function(btn, event, rec) {
		var d = rec.data;
		var tfa_type = PVE.Parser.parseTfaType(d.keys);
		var win = Ext.create('PVE.window.TFAEdit',{
		    tfa_type: tfa_type,
		    userid: d.userid
		});
		win.on('destroy', reload);
		win.show();
	    }
	});

	var perm_btn = new Proxmox.button.Button({
	    text: gettext('Permissions'),
	    disabled: false,
	    selModel: sm,
	    handler: function(btn, event, rec) {
		var win = Ext.create('PVE.dc.PermissionView', {
                    userid: rec.data.userid
		});
		win.show();
	    }
	});

        var tbar = [
            {
		text: gettext('Add'),
		disabled: !caps.access['User.Modify'],
		handler: function() {
                    var win = Ext.create('PVE.dc.UserEdit',{
                    });
                    win.on('destroy', reload);
                    win.show();
		}
            },
	    edit_btn, remove_btn, pwchange_btn, tfachange_btn, perm_btn
        ];

	var render_username = function(userid) {
	    return Ext.String.htmlEncode(userid.match(/^(.+)(@[^@]+)$/)[1]);
	};

	var render_realm = function(userid) {
	    return Ext.String.htmlEncode(userid.match(/@([^@]+)$/)[1]);
	};

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: tbar,
	    viewConfig: {
		trackOver: false
	    },
	    columns: [
		{
		    header: gettext('User name'),
		    width: 200,
		    sortable: true,
		    renderer: render_username,
		    dataIndex: 'userid'
		},
		{
		    header: gettext('Realm'),
		    width: 100,
		    sortable: true,
		    renderer: render_realm,
		    dataIndex: 'userid'
		},
		{
		    header: gettext('Enabled'),
		    width: 80,
		    sortable: true,
		    renderer: Proxmox.Utils.format_boolean,
		    dataIndex: 'enable'
		},
		{
		    header: gettext('Expire'),
		    width: 80,
		    sortable: true,
		    renderer: Proxmox.Utils.format_expire,
		    dataIndex: 'expire'
		},
		{
		    header: gettext('Name'),
		    width: 150,
		    sortable: true,
		    renderer: PVE.Utils.render_full_name,
		    dataIndex: 'firstname'
		},
		{
		    header: 'TFA',
		    width: 50,
		    sortable: true,
		    renderer: function(v) {
			var tfa_type = PVE.Parser.parseTfaType(v);
			if (tfa_type === undefined) {
			    return Proxmox.Utils.noText;
			} else if (tfa_type === 1) {
			    return Proxmox.Utils.yesText;
			} else {
			    return tfa_type;
			}
		    },
		    dataIndex: 'keys'
		},
		{
		    header: gettext('Comment'),
		    sortable: false,
		    renderer: Ext.String.htmlEncode,
		    dataIndex: 'comment',
		    flex: 1
		}
	    ],
	    listeners: {
		activate: reload,
		itemdblclick: run_editor
	    }
	});

	me.callParent();

	Proxmox.Utils.monStoreErrors(me, store);
    }
});
