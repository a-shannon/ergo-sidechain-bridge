const DOS_HEADER_MIN: usize = 64;
const COFF_HEADER_SIZE: usize = 20;
const SECTION_HEADER_SIZE: usize = 40;
const PE32_PLUS_OPTIONAL_MIN: usize = 240;
const IMPORT_DESCRIPTOR_SIZE: usize = 20;
const MAX_SECTIONS: usize = 96;
const MAX_IMPORTS: usize = 512;

const IMAGE_FILE_MACHINE_AMD64: u16 = 0x8664;
const IMAGE_FILE_EXECUTABLE_IMAGE: u16 = 0x0002;
const IMAGE_FILE_DLL: u16 = 0x2000;
const PE32_PLUS_MAGIC: u16 = 0x20b;

#[derive(Clone, Copy)]
struct Section {
    virtual_address: u32,
    virtual_size: u32,
    raw_offset: u32,
    raw_size: u32,
}

pub fn validate_authoritative_image(bytes: &[u8], allowed: &[String]) -> Result<(), ()> {
    let pe_offset = usize::try_from(read_u32(bytes, 0x3c)?).map_err(|_| ())?;
    if bytes.len() < DOS_HEADER_MIN
        || bytes.get(0..2) != Some(b"MZ")
        || pe_offset < DOS_HEADER_MIN
        || pe_offset % 4 != 0
        || bytes.get(pe_offset..checked_add(pe_offset, 4)?) != Some(b"PE\0\0")
    {
        return Err(());
    }

    let coff = checked_add(pe_offset, 4)?;
    let optional = checked_add(coff, COFF_HEADER_SIZE)?;
    if read_u16(bytes, coff)? != IMAGE_FILE_MACHINE_AMD64 {
        return Err(());
    }
    let section_count = usize::from(read_u16(bytes, checked_add(coff, 2)?)?);
    if section_count == 0 || section_count > MAX_SECTIONS {
        return Err(());
    }
    let optional_size = usize::from(read_u16(bytes, checked_add(coff, 16)?)?);
    let characteristics = read_u16(bytes, checked_add(coff, 18)?)?;
    if optional_size < PE32_PLUS_OPTIONAL_MIN || read_u16(bytes, optional)? != PE32_PLUS_MAGIC {
        return Err(());
    }
    if characteristics & IMAGE_FILE_EXECUTABLE_IMAGE == 0 || characteristics & IMAGE_FILE_DLL != 0 {
        return Err(());
    }
    let optional_end = checked_add(optional, optional_size)?;
    bytes.get(optional..optional_end).ok_or(())?;

    let size_of_image = read_u32(bytes, checked_add(optional, 56)?)?;
    let size_of_headers = read_u32(bytes, checked_add(optional, 60)?)?;
    let section_alignment = read_u32(bytes, checked_add(optional, 32)?)?;
    let file_alignment = read_u32(bytes, checked_add(optional, 36)?)?;
    let directory_count = read_u32(bytes, checked_add(optional, 108)?)?;
    if size_of_headers == 0
        || usize::try_from(size_of_headers).map_err(|_| ())? > bytes.len()
        || size_of_image < size_of_headers
        || directory_count < 14
        || usize::try_from(directory_count).map_err(|_| ())? > optional_size.saturating_sub(112) / 8
        || !valid_alignments(section_alignment, file_alignment)
        || size_of_headers % file_alignment != 0
        || size_of_image % section_alignment != 0
    {
        return Err(());
    }

    let section_table = optional_end;
    let section_table_end = checked_add(
        section_table,
        section_count.checked_mul(SECTION_HEADER_SIZE).ok_or(())?,
    )?;
    if section_table_end > usize::try_from(size_of_headers).map_err(|_| ())? {
        return Err(());
    }

    let mut sections = Vec::with_capacity(section_count);
    for index in 0..section_count {
        let base = checked_add(
            section_table,
            index.checked_mul(SECTION_HEADER_SIZE).ok_or(())?,
        )?;
        let virtual_size = read_u32(bytes, checked_add(base, 8)?)?;
        let virtual_address = read_u32(bytes, checked_add(base, 12)?)?;
        let raw_size = read_u32(bytes, checked_add(base, 16)?)?;
        let raw_offset = read_u32(bytes, checked_add(base, 20)?)?;
        let mapped_size = virtual_size.max(raw_size);
        if mapped_size == 0
            || virtual_address < size_of_headers
            || virtual_address % section_alignment != 0
            || virtual_address.checked_add(mapped_size).is_none()
            || virtual_address + mapped_size > size_of_image
            || (raw_size != 0
                && (raw_offset < size_of_headers
                    || raw_offset % file_alignment != 0
                    || raw_size % file_alignment != 0
                    || raw_offset.checked_add(raw_size).is_none()
                    || usize::try_from(raw_offset + raw_size).map_err(|_| ())? > bytes.len()))
        {
            return Err(());
        }
        sections.push(Section {
            virtual_address,
            virtual_size,
            raw_offset,
            raw_size,
        });
    }
    reject_overlaps(&sections)?;

    let import_rva = read_u32(bytes, checked_add(optional, 120)?)?;
    let import_size = read_u32(bytes, checked_add(optional, 124)?)?;
    let delay_rva = read_u32(bytes, checked_add(optional, 216)?)?;
    let delay_size = read_u32(bytes, checked_add(optional, 220)?)?;
    validate_empty_delay_imports(bytes, &sections, size_of_headers, delay_rva, delay_size)?;

    let mut imports = parse_imports(bytes, &sections, size_of_headers, import_rva, import_size)?;
    imports.sort_unstable();
    if imports.windows(2).any(|pair| pair[0] == pair[1])
        || imports
            .iter()
            .any(|name| allowed.binary_search(name).is_err())
    {
        return Err(());
    }
    Ok(())
}

fn valid_alignments(section: u32, file: u32) -> bool {
    section.is_power_of_two()
        && file.is_power_of_two()
        && if section < 4096 {
            section == file
        } else {
            (512..=65_536).contains(&file) && section >= file
        }
}

fn parse_imports(
    bytes: &[u8],
    sections: &[Section],
    size_of_headers: u32,
    rva: u32,
    size: u32,
) -> Result<Vec<String>, ()> {
    if rva == 0 || size == 0 {
        return if rva == 0 && size == 0 {
            Ok(Vec::new())
        } else {
            Err(())
        };
    }
    if size < IMPORT_DESCRIPTOR_SIZE as u32 {
        return Err(());
    }
    let table = rva_to_offset(bytes, sections, size_of_headers, rva, size)?;
    let table_end = checked_add(table, usize::try_from(size).map_err(|_| ())?)?;
    let mut imports = Vec::new();
    let mut cursor = table;
    let mut terminated = false;
    while checked_add(cursor, IMPORT_DESCRIPTOR_SIZE)? <= table_end {
        let descriptor = bytes
            .get(cursor..checked_add(cursor, IMPORT_DESCRIPTOR_SIZE)?)
            .ok_or(())?;
        if descriptor.iter().all(|byte| *byte == 0) {
            terminated = true;
            break;
        }
        if imports.len() >= MAX_IMPORTS {
            return Err(());
        }
        let name_rva = read_u32(bytes, checked_add(cursor, 12)?)?;
        if name_rva == 0 {
            return Err(());
        }
        imports.push(read_dll_name(bytes, sections, size_of_headers, name_rva)?);
        cursor = checked_add(cursor, IMPORT_DESCRIPTOR_SIZE)?;
    }
    if !terminated {
        return Err(());
    }
    Ok(imports)
}

fn read_dll_name(
    bytes: &[u8],
    sections: &[Section],
    size_of_headers: u32,
    rva: u32,
) -> Result<String, ()> {
    let mut name_bytes = Vec::new();
    for relative in 0..260u32 {
        let current_rva = rva.checked_add(relative).ok_or(())?;
        let offset = rva_to_offset(bytes, sections, size_of_headers, current_rva, 1)?;
        let byte = *bytes.get(offset).ok_or(())?;
        if byte == 0 {
            break;
        }
        name_bytes.push(byte);
    }
    if name_bytes.is_empty() || name_bytes.len() == 260 {
        return Err(());
    }
    normalize_import_dll_name(std::str::from_utf8(&name_bytes).map_err(|_| ())?)
}

fn validate_empty_delay_imports(
    bytes: &[u8],
    sections: &[Section],
    size_of_headers: u32,
    rva: u32,
    size: u32,
) -> Result<(), ()> {
    if rva == 0 && size == 0 {
        return Ok(());
    }
    if rva == 0 || size == 0 || size < 32 {
        return Err(());
    }
    let offset = rva_to_offset(bytes, sections, size_of_headers, rva, size)?;
    let end = checked_add(offset, usize::try_from(size).map_err(|_| ())?)?;
    if bytes
        .get(offset..end)
        .ok_or(())?
        .iter()
        .all(|byte| *byte == 0)
    {
        Ok(())
    } else {
        Err(())
    }
}

pub fn is_allowed_dll_name(name: &str) -> bool {
    name.len() > 4
        && name.len() <= 128
        && name.ends_with(".dll")
        && name.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'.' | b'_' | b'-')
        })
        && !name.contains("..")
}

fn normalize_import_dll_name(name: &str) -> Result<String, ()> {
    if !name.is_ascii() {
        return Err(());
    }
    let normalized = name.to_ascii_lowercase();
    if is_allowed_dll_name(&normalized) {
        Ok(normalized)
    } else {
        Err(())
    }
}

fn rva_to_offset(
    bytes: &[u8],
    sections: &[Section],
    size_of_headers: u32,
    rva: u32,
    size: u32,
) -> Result<usize, ()> {
    let end = rva.checked_add(size).ok_or(())?;
    if rva < size_of_headers {
        if end > size_of_headers {
            return Err(());
        }
        let offset = usize::try_from(rva).map_err(|_| ())?;
        bytes
            .get(offset..checked_add(offset, usize::try_from(size).map_err(|_| ())?)?)
            .ok_or(())?;
        return Ok(offset);
    }
    let section = sections
        .iter()
        .find(|section| {
            let mapped = section.virtual_size.max(section.raw_size);
            rva >= section.virtual_address && end <= section.virtual_address.saturating_add(mapped)
        })
        .ok_or(())?;
    let relative = rva.checked_sub(section.virtual_address).ok_or(())?;
    if relative.checked_add(size).ok_or(())? > section.raw_size {
        return Err(());
    }
    let offset = section.raw_offset.checked_add(relative).ok_or(())?;
    let offset = usize::try_from(offset).map_err(|_| ())?;
    bytes
        .get(offset..checked_add(offset, usize::try_from(size).map_err(|_| ())?)?)
        .ok_or(())?;
    Ok(offset)
}

fn reject_overlaps(sections: &[Section]) -> Result<(), ()> {
    for (index, left) in sections.iter().enumerate() {
        for right in &sections[index + 1..] {
            let left_virtual = (
                left.virtual_address,
                left.virtual_address
                    .checked_add(left.virtual_size.max(left.raw_size))
                    .ok_or(())?,
            );
            let right_virtual = (
                right.virtual_address,
                right
                    .virtual_address
                    .checked_add(right.virtual_size.max(right.raw_size))
                    .ok_or(())?,
            );
            if ranges_overlap(left_virtual, right_virtual) {
                return Err(());
            }
            if left.raw_size != 0 && right.raw_size != 0 {
                let left_raw = (
                    left.raw_offset,
                    left.raw_offset.checked_add(left.raw_size).ok_or(())?,
                );
                let right_raw = (
                    right.raw_offset,
                    right.raw_offset.checked_add(right.raw_size).ok_or(())?,
                );
                if ranges_overlap(left_raw, right_raw) {
                    return Err(());
                }
            }
        }
    }
    Ok(())
}

fn ranges_overlap(left: (u32, u32), right: (u32, u32)) -> bool {
    left.0 < right.1 && right.0 < left.1
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, ()> {
    Ok(u16::from_le_bytes(
        bytes
            .get(offset..checked_add(offset, 2)?)
            .ok_or(())?
            .try_into()
            .map_err(|_| ())?,
    ))
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, ()> {
    Ok(u32::from_le_bytes(
        bytes
            .get(offset..checked_add(offset, 4)?)
            .ok_or(())?
            .try_into()
            .map_err(|_| ())?,
    ))
}

fn checked_add(left: usize, right: usize) -> Result<usize, ()> {
    left.checked_add(right).ok_or(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn image(imports: &[&str]) -> Vec<u8> {
        let mut bytes = vec![0u8; 0x800];
        bytes[0..2].copy_from_slice(b"MZ");
        bytes[0x3c..0x40].copy_from_slice(&0x80u32.to_le_bytes());
        bytes[0x80..0x84].copy_from_slice(b"PE\0\0");
        bytes[0x84..0x86].copy_from_slice(&IMAGE_FILE_MACHINE_AMD64.to_le_bytes());
        bytes[0x86..0x88].copy_from_slice(&1u16.to_le_bytes());
        bytes[0x94..0x96].copy_from_slice(&(PE32_PLUS_OPTIONAL_MIN as u16).to_le_bytes());
        bytes[0x96..0x98].copy_from_slice(&IMAGE_FILE_EXECUTABLE_IMAGE.to_le_bytes());
        let optional = 0x98;
        bytes[optional..optional + 2].copy_from_slice(&PE32_PLUS_MAGIC.to_le_bytes());
        bytes[optional + 32..optional + 36].copy_from_slice(&0x1000u32.to_le_bytes());
        bytes[optional + 36..optional + 40].copy_from_slice(&0x200u32.to_le_bytes());
        bytes[optional + 56..optional + 60].copy_from_slice(&0x2000u32.to_le_bytes());
        bytes[optional + 60..optional + 64].copy_from_slice(&0x200u32.to_le_bytes());
        bytes[optional + 108..optional + 112].copy_from_slice(&16u32.to_le_bytes());
        let import_size = ((imports.len() + 1) * IMPORT_DESCRIPTOR_SIZE) as u32;
        bytes[optional + 120..optional + 124].copy_from_slice(&0x1000u32.to_le_bytes());
        bytes[optional + 124..optional + 128].copy_from_slice(&import_size.to_le_bytes());
        let section = optional + PE32_PLUS_OPTIONAL_MIN;
        bytes[section + 8..section + 12].copy_from_slice(&0x600u32.to_le_bytes());
        bytes[section + 12..section + 16].copy_from_slice(&0x1000u32.to_le_bytes());
        bytes[section + 16..section + 20].copy_from_slice(&0x600u32.to_le_bytes());
        bytes[section + 20..section + 24].copy_from_slice(&0x200u32.to_le_bytes());
        let mut name_offset = 0x300usize;
        for (index, name) in imports.iter().enumerate() {
            let descriptor = 0x200 + index * IMPORT_DESCRIPTOR_SIZE;
            let name_rva = 0x1000 + u32::try_from(name_offset - 0x200).unwrap();
            bytes[descriptor + 12..descriptor + 16].copy_from_slice(&name_rva.to_le_bytes());
            bytes[name_offset..name_offset + name.len()].copy_from_slice(name.as_bytes());
            name_offset += name.len() + 1;
        }
        bytes
    }

    #[test]
    fn accepts_case_insensitive_import_subset_of_runtime_allowlist() {
        let bytes = image(&["KERNEL32.dll", "ntdll.dll"]);
        assert!(validate_authoritative_image(
            &bytes,
            &[
                "kernel32.dll".into(),
                "kernelbase.dll".into(),
                "ntdll.dll".into(),
            ],
        )
        .is_ok());
    }

    #[test]
    fn rejects_malformed_rva_and_import_mismatch() {
        let mut malformed = image(&["kernel32.dll"]);
        malformed[0x200 + 12..0x200 + 16].copy_from_slice(&0x9000u32.to_le_bytes());
        assert!(validate_authoritative_image(&malformed, &["kernel32.dll".into()]).is_err());

        let bytes = image(&["kernel32.dll"]);
        assert!(validate_authoritative_image(&bytes, &["ntdll.dll".into()]).is_err());
    }

    #[test]
    fn rejects_overlapping_sections_and_delay_imports() {
        let mut overlapping = image(&["kernel32.dll"]);
        overlapping[0x86..0x88].copy_from_slice(&2u16.to_le_bytes());
        let second = 0x98 + PE32_PLUS_OPTIONAL_MIN + SECTION_HEADER_SIZE;
        overlapping[second + 8..second + 12].copy_from_slice(&0x100u32.to_le_bytes());
        overlapping[second + 12..second + 16].copy_from_slice(&0x1100u32.to_le_bytes());
        overlapping[second + 16..second + 20].copy_from_slice(&0x100u32.to_le_bytes());
        overlapping[second + 20..second + 24].copy_from_slice(&0x300u32.to_le_bytes());
        assert!(validate_authoritative_image(&overlapping, &["kernel32.dll".into()]).is_err());

        let mut delayed = image(&["kernel32.dll"]);
        let optional = 0x98;
        delayed[optional + 216..optional + 220].copy_from_slice(&0x1100u32.to_le_bytes());
        delayed[optional + 220..optional + 224].copy_from_slice(&32u32.to_le_bytes());
        assert!(validate_authoritative_image(&delayed, &["kernel32.dll".into()]).is_err());

        let mut empty_delay = image(&["kernel32.dll"]);
        empty_delay[optional + 216..optional + 220].copy_from_slice(&0x1200u32.to_le_bytes());
        empty_delay[optional + 220..optional + 224].copy_from_slice(&32u32.to_le_bytes());
        assert!(validate_authoritative_image(&empty_delay, &["kernel32.dll".into()]).is_ok());
    }

    #[test]
    fn dll_names_are_lowercase_basenames() {
        assert!(is_allowed_dll_name("kernel32.dll"));
        for invalid in ["KERNEL32.dll", "system32\\x.dll", "x/d.dll", "x", "..dll"] {
            assert!(!is_allowed_dll_name(invalid));
        }
    }
}
