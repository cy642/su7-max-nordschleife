package io.github.cy642.nordrun;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.util.List;

/** Grants the system installer temporary read access to one private APK. */
public final class UpdateFileProvider extends ContentProvider {
    static final String MIME = "application/vnd.android.package-archive";

    static Uri uriFor(Context context, File apk) {
        return new Uri.Builder().scheme("content").authority(context.getPackageName() + ".update")
                .appendPath("apk").appendPath(apk.getName()).build();
    }

    private File resolve(Uri uri) {
        Context context = getContext();
        List<String> parts = uri.getPathSegments();
        if (!uri.getAuthority().equals(context.getPackageName() + ".update") || parts.size() != 2
                || !"apk".equals(parts.get(0)) || !parts.get(1).matches("Nordrun-[0-9]+\\.[0-9]+\\.[0-9]+\\.apk")) {
            throw new IllegalArgumentException("Invalid update file");
        }
        return new File(new File(context.getCacheDir(), "updates"), parts.get(1));
    }

    @Override public boolean onCreate() { return true; }

    @Override public String getType(Uri uri) {
        resolve(uri);
        return MIME;
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new SecurityException("Read only");
        return ParcelFileDescriptor.open(resolve(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String order) {
        File apk = resolve(uri);
        String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
        MatrixCursor result = new MatrixCursor(columns, 1);
        MatrixCursor.RowBuilder row = result.newRow();
        for (String column : columns) {
            if (OpenableColumns.DISPLAY_NAME.equals(column)) row.add(apk.getName());
            else if (OpenableColumns.SIZE.equals(column)) row.add(apk.length());
            else row.add(null);
        }
        return result;
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
